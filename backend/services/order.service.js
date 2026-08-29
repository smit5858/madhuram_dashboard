const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Sale, SaleItem, Product, Stock, StockMovement, SerialUnit, Customer, Courier, Payment } = require("../models");
const inventoryService = require("./inventory.service");
const { notify } = require("./notification.service");

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
    const createdLines = [];
    const shipmentGroupId = `SALE-${sale.id}`;

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

      // Every order line gets a Courier record immediately — no separate acceptance step.
      // Fully-allocated lines start Pending; anything still backordered starts Waiting for
      // Stock. All lines from this sale share one shipment group (defaulting to "wait for the
      // complete order") until the Courier Employee splits it via updateShipmentType.
      const courier = await Courier.create(
        {
          customerName: customerName.trim(),
          name: customerName.trim(),
          address: fromAddress || null,
          city: city || null,
          mobileNo: trimmedPhone,
          phone: trimmedPhone,
          productName: product.name,
          quantity: requested,
          pending: true,
          status: allocated >= requested ? "PENDING" : "WAITING_FOR_STOCK",
          courierName: null,
          trackId: null,
          direction: "OUT",
          userId,
          saleId: sale.id,
          saleItemId: saleItem.id,
          shipmentGroupId,
          shipmentType: "SHIP_COMPLETE",
        },
        { transaction: t }
      );

      createdLines.push({ saleItem, product, courier });
    }

    // Fulfills the group immediately if every line was fully allocated (the common
    // single/all-in-stock case) — a no-op if anything above came back backordered.
    await inventoryService.tryFulfillReadyGroup(shipmentGroupId, { userId, transaction: t });

    const itemsResult = [];
    for (const { saleItem, product, courier } of createdLines) {
      await saleItem.reload({ transaction: t });
      itemsResult.push({ ...saleItem.toJSON(), productName: product.name, productType: product.productType, courierId: courier.id });
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

// Core return/write-off mechanics for a quantity of a line item that was already shipped.
// Shared by the standalone `returnItem` action and `cancelOrder`'s handling of the
// already-fulfilled portion of a cancelled sale. `defective` writes the units off instead of
// restocking them — use it when the returned goods aren't resellable.
const applyReturn = async ({ item, quantity, userId, reason, defective, serialNumbers }, { transaction: t }) => {
  const product = await Product.findByPk(item.productId, { transaction: t });

  if (product.productType === "NON_SERIAL") {
    if (!defective) {
      const stock = await Stock.findOne({ where: { productId: item.productId }, transaction: t, lock: true });
      if (stock) {
        stock.quantity += quantity;
        await stock.save({ transaction: t });
      }
    }
    await StockMovement.create(
      {
        productId: item.productId,
        type: defective ? "DAMAGE" : "RETURN",
        quantity: defective ? 0 : quantity,
        reservedDelta: 0,
        referenceType: "saleItem",
        referenceId: item.id,
        createdBy: userId,
        notes:
          reason ||
          (defective
            ? `${quantity} defective unit(s) written off for order item #${item.id}`
            : `Returned ${quantity} unit(s) for order item #${item.id}`),
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
        limit: quantity,
        transaction: t,
        lock: true,
      });
    }
    if (units.length < quantity) {
      const err = new Error("Not enough sold serial units matched for this return");
      err.statusCode = 400;
      throw err;
    }
    for (const unit of units) {
      // Non-defective: RETURNED, pending inspection (restocked later via updateSerialStatus).
      // Defective: DAMAGED directly — already known unsellable, no inspection step needed.
      unit.status = defective ? "DAMAGED" : "RETURNED";
      unit.returnedAt = new Date();
      await unit.save({ transaction: t });
    }
    await StockMovement.create(
      {
        productId: item.productId,
        type: defective ? "DAMAGE" : "RETURN",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "saleItem",
        referenceId: item.id,
        createdBy: userId,
        notes:
          reason ||
          (defective
            ? `${units.length} defective serial unit(s) written off for order item #${item.id}`
            : `${units.length} serial unit(s) returned for order item #${item.id}, pending inspection`),
      },
      { transaction: t }
    );
  }

  item.returnedQuantity += quantity;
  await item.save({ transaction: t });
};

// Cancels an order. Handles every line item regardless of fulfillment progress: releases (or,
// if `defective`, writes off) any still-reserved/backordered remainder, and returns (or writes
// off) any portion already shipped, then marks the whole order CANCELLED.
const cancelOrder = async ({ saleId, userId, reason, defective }) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }

    const items = await SaleItem.findAll({ where: { saleId }, transaction: t, lock: true });

    for (const item of items) {
      if (item.fulfillmentStatus === "CANCELLED") continue;

      const toRelease = item.allocatedQuantity;
      if (toRelease > 0) {
        if (defective) {
          await inventoryService.writeOffReservation(
            { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: reason || "Order cancelled — defective" },
            { transaction: t }
          );
        } else {
          await inventoryService.releaseReservation(
            { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: reason || "Order cancelled" },
            { transaction: t }
          );
        }
      }

      const netFulfilled = item.fulfilledQuantity - item.returnedQuantity;
      if (netFulfilled > 0) {
        await applyReturn({ item, quantity: netFulfilled, userId, reason: reason || "Order cancelled", defective }, { transaction: t });
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

// Narrower cancellation of a single order line — same defective-aware release/return handling
// as cancelOrder, scoped to one line item.
const cancelOrderItem = async ({ saleId, saleItemId, userId, reason, defective }) => {
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
      if (defective) {
        await inventoryService.writeOffReservation(
          { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: reason || "Order item cancelled — defective" },
          { transaction: t }
        );
      } else {
        await inventoryService.releaseReservation(
          { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: reason || "Order item cancelled" },
          { transaction: t }
        );
      }
    }

    const netFulfilled = item.fulfilledQuantity - item.returnedQuantity;
    if (netFulfilled > 0) {
      await applyReturn({ item, quantity: netFulfilled, userId, reason: reason || "Order item cancelled", defective }, { transaction: t });
    }

    item.allocatedQuantity = 0;
    item.backorderedQuantity = 0;
    item.fulfillmentStatus = "CANCELLED";
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
const returnItem = async ({ saleItemId, quantity, userId, reason, refundAmount, serialNumbers, defective }) => {
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

    await applyReturn({ item, quantity: requested, userId, reason, defective, serialNumbers }, { transaction: t });

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
  cancelOrder,
  cancelOrderItem,
  returnItem,
};
