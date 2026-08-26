const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Sale, SaleItem, Product, Stock, StockMovement, SerialUnit, Customer, Courier, Notification, Payment } = require("../models");
const { getIO } = require("../socket");
const inventoryService = require("./inventory.service");

// Sequential per-month invoice numbers, e.g. MM-202608-0001. Row-locked read of the last
// invoice in the current month prevents two concurrent creates from colliding.
const generateInvoiceNumber = async (t) => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const prefix = `MM-${year}${month}`;

  const lastSale = await Sale.findOne({
    where: { invoiceNumber: { [Op.like]: `${prefix}-%` } },
    order: [["id", "DESC"]],
    lock: true,
    transaction: t,
  });

  let seq = 1;
  if (lastSale && lastSale.invoiceNumber) {
    const parts = lastSale.invoiceNumber.split("-");
    seq = parseInt(parts[parts.length - 1]) + 1;
  }

  return `${prefix}-${String(seq).padStart(4, "0")}`;
};

const computePaymentStatus = ({ sellingAmount, collectedAmount, refundedAmount }) => {
  if (refundedAmount > 0 && refundedAmount >= collectedAmount) return "REFUNDED";
  if (refundedAmount > 0 && refundedAmount < collectedAmount) return "PARTIALLY_REFUNDED";
  if (collectedAmount <= 0) return "UNPAID";
  if (collectedAmount < sellingAmount) return "PARTIALLY_PAID";
  return "PAID";
};

// Fire-and-forget notification + socket emit — mirrors the existing sells.controller.js
// pattern exactly: created after commit, wrapped so a failure here never affects the
// already-committed order.
const notify = async (events) => {
  let created = [];
  try {
    created = await Promise.all(
      events.map((evt) =>
        Notification.create({
          recipientModule: evt.recipientModule,
          type: evt.type,
          title: evt.title,
          message: evt.message,
          referenceType: evt.referenceType,
          referenceId: evt.referenceId,
        }).then((notif) => ({ evt, notif }))
      )
    );
  } catch (notifErr) {
    console.warn("Notification creation failed:", notifErr.message);
    return;
  }

  try {
    const io = getIO();
    for (const { evt, notif } of created) {
      io.to(evt.recipientModule).emit(evt.event, { notification: notif, ...evt.payload });
    }
  } catch (socketErr) {
    console.warn("WebSocket emit failed:", socketErr.message);
  }
};

// Supersedes the item loop that used to live directly in sells.controller.createSale.
// Reservation only — no fulfillment, no courier — happens here regardless of payment
// status (decision: fulfillment is independent of payment).
const createOrder = async ({
  platform,
  customerId: inputCustomerId,
  customerName,
  customerNumber,
  paymentMethod,
  city,
  fromAddress,
  pincode,
  sellingAmount,
  collectedAmount,
  notes,
  items,
  userId,
}) => {
  if (!customerName || !customerName.trim()) {
    const err = new Error("Customer name is required");
    err.statusCode = 400;
    throw err;
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    const err = new Error("At least one order item is required");
    err.statusCode = 400;
    throw err;
  }
  for (const item of items) {
    if (!item.productId || !item.quantity || item.quantity < 1) {
      const err = new Error("Each item must have a valid productId and quantity >= 1");
      err.statusCode = 400;
      throw err;
    }
  }

  const t = await sequelize.transaction();
  try {
    const selling = parseFloat(sellingAmount) || 0;
    const collected = parseFloat(collectedAmount) || 0;
    const pending = Math.max(0, selling - collected);
    const paymentStatus = computePaymentStatus({ sellingAmount: selling, collectedAmount: collected, refundedAmount: 0 });

    // Customer resolve-or-create, same pattern as before
    let finalCustomerId = inputCustomerId || null;
    const trimmedPhone = customerNumber ? customerNumber.trim() : null;

    if (finalCustomerId) {
      const existingCustomer = await Customer.findByPk(finalCustomerId, { transaction: t, lock: true });
      if (!existingCustomer) finalCustomerId = null;
    }

    if (!finalCustomerId && trimmedPhone) {
      let customer = await Customer.findOne({
        where: {
          [Op.or]: [{ phone: trimmedPhone }, { phone: { [Op.like]: `%${trimmedPhone.slice(-10)}` } }],
        },
        transaction: t,
        lock: true,
      });

      if (customer) {
        finalCustomerId = customer.id;
        let needsUpdate = false;
        if (!customer.address && fromAddress) {
          customer.address = fromAddress.trim();
          needsUpdate = true;
        }
        if (!customer.city && city) {
          customer.city = city.trim();
          needsUpdate = true;
        }
        if (!customer.pincode && pincode) {
          customer.pincode = pincode.trim();
          needsUpdate = true;
        }
        if (needsUpdate) await customer.save({ transaction: t });
      } else {
        const newCustomer = await Customer.create(
          {
            name: customerName.trim(),
            phone: trimmedPhone,
            address: fromAddress ? fromAddress.trim() : null,
            city: city ? city.trim() : null,
            pincode: pincode ? pincode.trim() : null,
            createdBy: userId,
          },
          { transaction: t }
        );
        finalCustomerId = newCustomer.id;
      }
    }

    const invoiceNumber = await generateInvoiceNumber(t);

    const sale = await Sale.create(
      {
        invoiceNumber,
        platform: platform || null,
        customerId: finalCustomerId,
        customerName: customerName.trim(),
        customerNumber: trimmedPhone,
        paymentMethod: paymentMethod || null,
        city: city || null,
        fromAddress: fromAddress || null,
        pincode: pincode || null,
        sellingAmount: selling,
        collectedAmount: collected,
        pendingAmount: pending,
        paymentStatus,
        fulfillmentStatus: "PENDING",
        status: "PENDING",
        notes: notes || null,
        createdBy: userId,
      },
      { transaction: t }
    );

    if (collected > 0) {
      await Payment.create(
        {
          saleId: sale.id,
          amount: collected,
          method: paymentMethod || null,
          createdBy: userId,
        },
        { transaction: t }
      );
    }

    // Sort by productId ASC so two concurrent multi-line orders touching overlapping
    // products always acquire Stock row locks in the same relative order (deadlock avoidance).
    const sortedItems = [...items].sort((a, b) => a.productId - b.productId);
    const itemsResult = [];

    for (const item of sortedItems) {
      const product = await Product.findByPk(item.productId, { transaction: t });
      if (!product) {
        const err = new Error(`Product ID ${item.productId} not found`);
        err.statusCode = 404;
        throw err;
      }

      const requested = parseInt(item.quantity);
      const serialNumbers = Array.isArray(item.serialNumbers) && item.serialNumbers.length > 0 ? item.serialNumbers : undefined;

      if (serialNumbers && product.productType !== "SERIALIZED") {
        const err = new Error(`${product.name} is not a serial-tracked product — remove the selected serial numbers`);
        err.statusCode = 400;
        throw err;
      }
      if (serialNumbers && serialNumbers.length !== requested) {
        const err = new Error(`Selected serial numbers (${serialNumbers.length}) must match the quantity (${requested}) for ${product.name}`);
        err.statusCode = 400;
        throw err;
      }

      const saleItem = await SaleItem.create(
        {
          saleId: sale.id,
          productId: item.productId,
          quantity: requested,
          sellingPrice: parseFloat(item.sellingPrice) || 0,
          fulfillmentStatus: "PENDING",
          allocatedQuantity: 0,
          fulfilledQuantity: 0,
          backorderedQuantity: 0,
        },
        { transaction: t }
      );

      const reserveResult = await inventoryService.reserveStock(
        { productId: item.productId, saleItemId: saleItem.id, quantity: requested, userId, serialNumbers },
        { transaction: t }
      );
      const allocated = reserveResult.allocated;
      const backordered = reserveResult.backordered;

      saleItem.allocatedQuantity = allocated;
      saleItem.backorderedQuantity = backordered;
      saleItem.fulfillmentStatus = inventoryService.computeItemFulfillmentStatus(saleItem);
      await saleItem.save({ transaction: t });

      itemsResult.push({ ...saleItem.toJSON(), productName: product.name, productType: product.productType });
    }

    await inventoryService.recomputeSaleFulfillmentStatus(sale.id, { transaction: t });
    await sale.reload({ transaction: t });

    await t.commit();

    const creatorName = "Sells Member";
    const dateFormatted = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const productSummary = itemsResult.map((i) => `${i.productName} × ${i.quantity}`).join(", ");

    await notify([
      {
        recipientModule: "admin",
        type: "NEW_SALE",
        title: "New Sells Entry",
        message: `Customer: ${customerName}\nAmount: ₹${selling.toFixed(2)}\nCreated by: ${creatorName}\nDate: ${dateFormatted}`,
        referenceType: "sale",
        referenceId: sale.id,
        event: "new_sale",
        payload: { sale: { id: sale.id, invoiceNumber, customerName, sellingAmount: selling, createdBy: userId, creatorName } },
      },
      {
        recipientModule: "account",
        type: "NEW_SALE",
        title: "New Sells Entry",
        message: `Customer: ${customerName}\nAmount: ₹${selling.toFixed(2)}\nCreated by: ${creatorName}\nDate: ${dateFormatted}`,
        referenceType: "sale",
        referenceId: sale.id,
        event: "new_sale",
        payload: { sale: { id: sale.id, invoiceNumber, customerName, sellingAmount: selling, collectedAmount: collected, pendingAmount: pending } },
      },
      {
        recipientModule: "couriers",
        type: "NEW_SALE",
        title: "New Sales Entry",
        message: `Customer: ${customerName}\nCity: ${city || "—"}\nProducts: ${productSummary}\nAmount: ₹${selling.toFixed(2)}\nPayment: ${paymentMethod || "—"}`,
        referenceType: "sale",
        referenceId: sale.id,
        event: "new_sale",
        payload: { sale: { id: sale.id, invoiceNumber, customerName, city } },
      },
    ]);

    return { ...sale.toJSON(), items: itemsResult };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Records a payment/deposit. Never touches stock or fulfillment — payment and
// fulfillment are fully independent state machines.
const recordPayment = async ({ saleId, amount, method, userId, notes }) => {
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount === 0) {
    const err = new Error("amount must be a non-zero number");
    err.statusCode = 400;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }

    const newCollected = Math.max(0, parseFloat(sale.collectedAmount) + parsedAmount);
    sale.collectedAmount = newCollected;
    sale.pendingAmount = Math.max(0, parseFloat(sale.sellingAmount) - newCollected);
    sale.paymentStatus = computePaymentStatus({
      sellingAmount: parseFloat(sale.sellingAmount),
      collectedAmount: newCollected,
      refundedAmount: parseFloat(sale.refundedAmount),
    });
    if (method) sale.paymentMethod = method;
    await sale.save({ transaction: t });

    await Payment.create(
      {
        saleId: sale.id,
        amount: parsedAmount,
        method: method || sale.paymentMethod || null,
        notes: notes || null,
        createdBy: userId,
      },
      { transaction: t }
    );

    await t.commit();

    if (parsedAmount > 0) {
      await notify([
        {
          recipientModule: "account",
          type: "PAYMENT_RECEIVED",
          title: "Payment Received",
          message: `Invoice ${sale.invoiceNumber}: ₹${parsedAmount.toFixed(2)} received${notes ? ` — ${notes}` : ""}`,
          referenceType: "sale",
          referenceId: sale.id,
          event: "payment_received",
          payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber, collectedAmount: newCollected, pendingAmount: sale.pendingAmount, paymentStatus: sale.paymentStatus } },
        },
        {
          recipientModule: "admin",
          type: "PAYMENT_RECEIVED",
          title: "Payment Received",
          message: `Invoice ${sale.invoiceNumber}: ₹${parsedAmount.toFixed(2)} received${notes ? ` — ${notes}` : ""}`,
          referenceType: "sale",
          referenceId: sale.id,
          event: "payment_received",
          payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber } },
        },
      ]);
    }

    return sale;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Converts allocated quantity into an actual shipment (physical) or digital delivery
// (license). Physical fulfillment creates a Courier record; license fulfillment never does.
const fulfillOrderItem = async ({ saleId, saleItemId, quantity, userId, serialNumbers, courierName, trackId }) => {
  const requested = parseInt(quantity);
  if (isNaN(requested) || requested <= 0) {
    const err = new Error("quantity must be a positive integer");
    err.statusCode = 400;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }

    const item = await SaleItem.findOne({ where: { id: saleItemId, saleId }, transaction: t, lock: true });
    if (!item) {
      const err = new Error("Order item not found");
      err.statusCode = 404;
      throw err;
    }
    if (requested > item.allocatedQuantity) {
      const err = new Error("Cannot fulfill more than is currently allocated for this order line");
      err.statusCode = 400;
      throw err;
    }

    const product = await Product.findByPk(item.productId, { transaction: t });

    await inventoryService.fulfillStock(
      { productId: item.productId, saleItemId: item.id, quantity: requested, userId, serialNumbers },
      { transaction: t }
    );
    await item.reload({ transaction: t });

    const courier = await Courier.create(
      {
        customerName: sale.customerName,
        address: sale.fromAddress,
        city: sale.city,
        mobileNo: sale.customerNumber,
        productName: product.name,
        quantity: requested,
        pending: true,
        direction: "OUT",
        courierName: courierName || null,
        trackId: trackId || null,
        userId,
        saleId: sale.id,
        saleItemId: item.id,
      },
      { transaction: t }
    );

    await inventoryService.recomputeSaleFulfillmentStatus(saleId, { transaction: t });
    await sale.reload({ transaction: t });

    await t.commit();

    await notify([
      {
        recipientModule: "account",
        type: "ORDER_FULFILLED",
        title: "Order Shipped",
        message: `Invoice ${sale.invoiceNumber}: ${product.name} × ${requested} shipped`,
        referenceType: "saleItem",
        referenceId: item.id,
        event: "order_fulfilled",
        payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber }, item: { id: item.id, productId: item.productId } },
      },
      {
        recipientModule: "couriers",
        type: "ORDER_FULFILLED",
        title: "Order Ready for Courier",
        message: `Invoice ${sale.invoiceNumber}: ${product.name} × ${requested} — customer: ${sale.customerName}, city: ${sale.city || "—"}`,
        referenceType: "saleItem",
        referenceId: item.id,
        event: "order_fulfilled",
        payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber }, courierId: courier.id },
      },
    ]);

    return { item, courier };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Cancels an entire order. Rejects (409) if any item has already been fulfilled in part —
// use cancelOrderItem for the still-unfulfilled remainder, or returnItem for shipped goods.
const cancelOrder = async ({ saleId, userId, reason }) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }

    const items = await SaleItem.findAll({ where: { saleId }, transaction: t, lock: true });
    if (items.some((i) => i.fulfilledQuantity > 0)) {
      const err = new Error(
        "This order has already been partially fulfilled — cancel the remaining unfulfilled portion per line item, or use the return workflow for shipped goods"
      );
      err.statusCode = 409;
      throw err;
    }

    for (const item of items) {
      if (item.fulfillmentStatus === "CANCELLED") continue;
      const toRelease = item.allocatedQuantity;
      if (toRelease > 0) {
        await inventoryService.releaseReservation(
          { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: reason || "Order cancelled" },
          { transaction: t }
        );
      }
      item.allocatedQuantity = 0;
      item.backorderedQuantity = 0;
      item.fulfillmentStatus = "CANCELLED";
      await item.save({ transaction: t });
    }

    sale.status = "CANCELLED";
    sale.fulfillmentStatus = "CANCELLED";
    await sale.save({ transaction: t });

    await t.commit();
    return sale;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Narrower cancellation of a single unfulfilled (or partially-fulfilled) order line —
// releases only that line's still-allocated/backordered remainder.
const cancelOrderItem = async ({ saleId, saleItemId, userId, reason }) => {
  const t = await sequelize.transaction();
  try {
    const item = await SaleItem.findOne({ where: { id: saleItemId, saleId }, transaction: t, lock: true });
    if (!item) {
      const err = new Error("Order item not found");
      err.statusCode = 404;
      throw err;
    }
    if (item.fulfillmentStatus === "CANCELLED") return item;

    const toRelease = item.allocatedQuantity;
    if (toRelease > 0) {
      await inventoryService.releaseReservation(
        { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: reason || "Order item cancelled" },
        { transaction: t }
      );
    }

    item.allocatedQuantity = 0;
    item.backorderedQuantity = 0;
    item.fulfillmentStatus = item.fulfilledQuantity > 0 ? "PARTIALLY_FULFILLED" : "CANCELLED";
    await item.save({ transaction: t });

    await inventoryService.recomputeSaleFulfillmentStatus(saleId, { transaction: t });

    await t.commit();
    return item;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Records a return of previously-fulfilled (shipped/delivered) quantity.
const returnItem = async ({ saleItemId, quantity, userId, reason, refundAmount, serialNumbers }) => {
  const requested = parseInt(quantity);
  if (isNaN(requested) || requested <= 0) {
    const err = new Error("quantity must be a positive integer");
    err.statusCode = 400;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const item = await SaleItem.findByPk(saleItemId, { transaction: t, lock: true });
    if (!item) {
      const err = new Error("Order item not found");
      err.statusCode = 404;
      throw err;
    }

    const netFulfilled = item.fulfilledQuantity - item.returnedQuantity;
    if (requested > netFulfilled) {
      const err = new Error("Cannot return more than the net fulfilled quantity for this order line");
      err.statusCode = 400;
      throw err;
    }

    const product = await Product.findByPk(item.productId, { transaction: t });

    if (product.productType === "NON_SERIAL") {
      const stock = await Stock.findOne({ where: { productId: item.productId }, transaction: t, lock: true });
      if (stock) {
        stock.quantity += requested;
        await stock.save({ transaction: t });
      }
      await StockMovement.create(
        {
          productId: item.productId,
          type: "RETURN",
          quantity: requested,
          reservedDelta: 0,
          referenceType: "saleItem",
          referenceId: item.id,
          createdBy: userId,
          notes: reason || `Returned ${requested} unit(s) for order item #${item.id}`,
        },
        { transaction: t }
      );
    } else {
      let units;
      if (serialNumbers && serialNumbers.length) {
        units = await SerialUnit.findAll({
          where: { productId: item.productId, saleItemId: item.id, status: "SOLD", serialNumber: { [Op.in]: serialNumbers } },
          transaction: t,
          lock: true,
        });
      } else {
        units = await SerialUnit.findAll({
          where: { productId: item.productId, saleItemId: item.id, status: "SOLD" },
          order: [["id", "ASC"]],
          limit: requested,
          transaction: t,
          lock: true,
        });
      }
      if (units.length < requested) {
        const err = new Error("Not enough sold serial units matched for this return");
        err.statusCode = 400;
        throw err;
      }
      for (const unit of units) {
        unit.status = "RETURNED";
        unit.returnedAt = new Date();
        await unit.save({ transaction: t });
      }
      // Not auto-restocked — Stock.quantity only increases once a returned serial unit
      // is inspected and accepted via inventoryService.updateSerialStatus.
      await StockMovement.create(
        {
          productId: item.productId,
          type: "RETURN",
          quantity: 0,
          reservedDelta: 0,
          referenceType: "saleItem",
          referenceId: item.id,
          createdBy: userId,
          notes: reason || `${requested} serial unit(s) returned for order item #${item.id}, pending inspection`,
        },
        { transaction: t }
      );
    }

    item.returnedQuantity += requested;
    await item.save({ transaction: t });

    const sale = await Sale.findByPk(item.saleId, { transaction: t, lock: true });
    if (refundAmount && parseFloat(refundAmount) > 0) {
      const refund = parseFloat(refundAmount);
      sale.refundedAmount = parseFloat(sale.refundedAmount) + refund;
      sale.paymentStatus = computePaymentStatus({
        sellingAmount: parseFloat(sale.sellingAmount),
        collectedAmount: parseFloat(sale.collectedAmount),
        refundedAmount: parseFloat(sale.refundedAmount),
      });
      await sale.save({ transaction: t });
    }

    await t.commit();
    return item;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

module.exports = {
  computePaymentStatus,
  createOrder,
  recordPayment,
  fulfillOrderItem,
  cancelOrder,
  cancelOrderItem,
  returnItem,
};
