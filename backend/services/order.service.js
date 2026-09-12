const { Op } = require("sequelize");
const dayjs = require("dayjs");
const sequelize = require("../config/db");
const { Sale, SaleItem, Product, Stock, StockMovement, SerialUnit, Customer, Courier, Payment, SaleBankAccount } = require("../models");
const inventoryService = require("./inventory.service");
const { notify } = require("./notification.service");
const { createIncomeForSale, removeIncomeForSale } = require("./incomeSync.service");
const { recalculateDay } = require("./dailyBalance.service");
const customerLedgerService = require("./customerLedger.service");
const { recalculateCourierChargeForDates } = require("./courierCharge.service");

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

// BankTransfer/UPI need at least one bank account named once money has actually been collected
// on the sale — matching customerLedger.service.js's needsBankSplit for the same two methods.
const needsBankSplit = (paymentMethod) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

// Validates and normalizes a sale's bank-payment allocation rows — each {bankAccountId, amount}
// pair must name a bank account and a positive amount, and the rows may never claim more than
// what was actually collected on the sale (the same bank account can appear more than once;
// rows are never merged). Shared by createOrder below and sells.controller.js#updateSale.
const normalizeBankPayments = (bankPayments, collectedAmount, paymentMethod) => {
  const rows = (Array.isArray(bankPayments) ? bankPayments : [])
    .filter((row) => row && row.bankAccountId)
    .map((row) => ({ bankAccountId: Number(row.bankAccountId), amount: parseFloat(row.amount) || 0 }));

  // Nothing to attribute to a bank yet when collectedAmount is 0 (e.g. a pending sale awaiting
  // payment) — the requirement only kicks in once there's an actual amount collected via a
  // bank-routed method.
  if (needsBankSplit(paymentMethod) && collectedAmount > 0 && rows.length === 0) {
    const err = new Error("Select at least one bank account for this payment method");
    err.statusCode = 400;
    throw err;
  }

  for (const row of rows) {
    if (!row.amount || row.amount <= 0) {
      const err = new Error("Each bank account payment row must have an amount greater than 0");
      err.statusCode = 400;
      throw err;
    }
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (total > collectedAmount + 0.01) {
    const err = new Error("Bank account payment amounts cannot exceed the collected amount");
    err.statusCode = 400;
    throw err;
  }

  return rows;
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
  bankPayments,
  city,
  fromAddress,
  pincode,
  sellingAmount,
  collectedAmount,
  notes,
  items,
  userId,
  createCourierEntry = true,
  createAccountEntry = true,
  leadId,
  to,
  courierName,
  courierCharge,
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

  const parsedCourierCharge = courierCharge === undefined || courierCharge === null || courierCharge === "" ? 0 : parseFloat(courierCharge);
  if (isNaN(parsedCourierCharge) || parsedCourierCharge < 0) {
    const err = new Error("Courier charge must be a non-negative number");
    err.statusCode = 400;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const selling = parseFloat(sellingAmount) || 0;
    const collected = parseFloat(collectedAmount) || 0;
    const pending = Math.max(0, selling - collected);
    const paymentStatus = computePaymentStatus({ sellingAmount: selling, collectedAmount: collected, refundedAmount: 0 });

    // Bank Account field — shown every time regardless of Payment Method, optional, and lets
    // the collected amount be split across multiple bank accounts (each with its own amount —
    // see saleBankAccount.model.js). bankAccountId is kept in sync as the first allocation's
    // bank for any reader that still uses the legacy single-account column.
    const bankPaymentRows = normalizeBankPayments(bankPayments, collected, paymentMethod);
    const bankAccountId = bankPaymentRows[0]?.bankAccountId || null;

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
        bankAccountId,
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
        leadId: leadId || null,
        to: to || "Madhuram Motor",
        courierName: courierName || null,
        courierCharge: parsedCourierCharge,
      },
      { transaction: t }
    );

    if (bankPaymentRows.length > 0) {
      await SaleBankAccount.bulkCreate(
        bankPaymentRows.map((row) => ({ saleId: sale.id, bankAccountId: row.bankAccountId, amount: row.amount })),
        { transaction: t }
      );
    }

    if (collected > 0) {
      await Payment.create(
        {
          saleId: sale.id,
          amount: collected,
          method: paymentMethod || null,
          bankAccountId,
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

      // Every physical order line gets a Courier record immediately — no separate acceptance
      // step. Fully-allocated lines start Pending; anything still backordered starts Waiting for
      // Stock. All lines from this sale share one shipment group (defaulting to "wait for the
      // complete order") until the Courier Employee splits it via updateShipmentType.
      // Skipped when the caller opted out via createCourierEntry (e.g. a walk-in sale that
      // doesn't need shipping), or unconditionally for SOFTWARE lines — software is fulfilled via
      // installation/service, never shipped, so it must never produce a Courier. Either way the
      // line is fulfilled directly below instead of waiting on shipment-group readiness.
      const courier = createCourierEntry && product.productType !== "SOFTWARE"
        ? await Courier.create(
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
              productStockStatus: allocated >= requested ? "IN_STOCK" : "OUT_OF_STOCK",
              courierName: courierName || null,
              trackId: null,
              direction: "OUT",
              userId,
              saleId: sale.id,
              saleItemId: saleItem.id,
              shipmentGroupId,
              shipmentType: "SHIP_COMPLETE",
            },
            { transaction: t }
          )
        : null;

      createdLines.push({ saleItem, product, courier });
    }

    // Fulfills the shipment group immediately if every courier-bearing line was fully allocated
    // (the common single/all-in-stock case) — a no-op if anything above came back backordered,
    // and a no-op with an empty group if createCourierEntry was off or every line was SOFTWARE.
    await inventoryService.tryFulfillReadyGroup(shipmentGroupId, { userId, transaction: t });

    // Any line that didn't get a Courier (createCourierEntry off, or a SOFTWARE line even in an
    // otherwise courier-bearing mixed sale) has no shipment to coordinate around — fulfill its
    // allocated quantity directly instead of waiting on group readiness. Anything still
    // backordered stays that way and gets picked up by the normal backorder sweep when stock
    // arrives (SOFTWARE can never be backordered, so this only matters for physical products).
    for (const { saleItem, courier } of createdLines) {
      if (!courier && saleItem.allocatedQuantity > 0) {
        await inventoryService.fulfillStock(
          { productId: saleItem.productId, saleItemId: saleItem.id, quantity: saleItem.allocatedQuantity, userId },
          { transaction: t }
        );
      }
    }

    const itemsResult = [];
    for (const { saleItem, product, courier } of createdLines) {
      await saleItem.reload({ transaction: t });
      itemsResult.push({ ...saleItem.toJSON(), productName: product.name, productType: product.productType, courierId: courier ? courier.id : null });
    }

    await inventoryService.recomputeSaleFulfillmentStatus(sale.id, { transaction: t });
    await sale.reload({ transaction: t });

    // Customer account ledger: a SALE debit for the full selling amount, plus a PAYMENT credit
    // for whatever was collected up front — only when the sale resolved to a real Customer (no
    // phone number given means no Customer row, and the ledger is customer-scoped). See
    // customerLedger.service.js — the single place the running balance is computed everywhere.
    if (finalCustomerId) {
      await customerLedgerService.recordSaleDebit({ customerId: finalCustomerId, saleId: sale.id, amount: selling, userId }, { transaction: t });
      if (collected > 0) {
        await customerLedgerService.recordPayment(
          { customerId: finalCustomerId, saleId: sale.id, amount: collected, paymentMethod: paymentMethod || null, bankAccountId, userId },
          { transaction: t }
        );
      }
    }

    // Every Sale automatically creates exactly one Account → Income entry, in the same
    // transaction as the sale itself (see incomeSync.service.js#createIncomeForSale) — unless
    // the caller opted out (e.g. a Lead auto-creating its placeholder Sale with nothing to book
    // yet). The entry is created later instead, the first time real amounts are saved — see
    // incomeSync.service.js#syncIncomeForSaleUpdate.
    const incomeEntryDate = createAccountEntry ? await createIncomeForSale(sale, { transaction: t, userId }) : null;

    await t.commit();

    // Feed the Account daily balance rollup (runs its own transaction — see
    // dailyBalance.service.js). Kept out of the transaction above so the shared per-day
    // balance row isn't locked for the whole order-creation transaction.
    if (incomeEntryDate) await recalculateDay(incomeEntryDate);

    const creatorName = "Sells Member";
    const dateFormatted = dayjs().format("DD-MM-YYYY");
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
      // Nothing for the couriers module to act on when no Courier record was created for this sale
      // (createCourierEntry off, or every line was SOFTWARE).
      ...(createdLines.some((l) => l.courier)
        ? [
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
          ]
        : []),
    ].filter((n) => createAccountEntry || n.recipientModule !== "account"));

    return { ...sale.toJSON(), items: itemsResult };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Records a payment/deposit. Never touches stock or fulfillment — payment and
// fulfillment are fully independent state machines.
const recordPayment = async ({ saleId, amount, method, bankAccountId, userId, notes }) => {
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
    const effectiveMethod = method || sale.paymentMethod || null;
    if (method) sale.paymentMethod = method;
    if (effectiveMethod === "BankTransfer") sale.bankAccountId = bankAccountId || sale.bankAccountId || null;
    await sale.save({ transaction: t });

    await Payment.create(
      {
        saleId: sale.id,
        amount: parsedAmount,
        method: effectiveMethod,
        bankAccountId: effectiveMethod === "BankTransfer" ? bankAccountId || null : null,
        notes: notes || null,
        createdBy: userId,
      },
      { transaction: t }
    );

    if (sale.customerId && parsedAmount !== 0) {
      const ledgerRecordFn = parsedAmount > 0 ? customerLedgerService.recordPayment : customerLedgerService.recordAdjustment;
      await ledgerRecordFn(
        { customerId: sale.customerId, saleId: sale.id, amount: parsedAmount, paymentMethod: effectiveMethod, bankAccountId, note: notes, userId },
        { transaction: t }
      );
    }

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

  if (product.productType === "SOFTWARE") {
    // No physical/serial unit was ever consumed for a software line — nothing to restock or
    // write off. Just fall through to the shared returnedQuantity bookkeeping below.
  } else if (inventoryService.STOCK_TRACKED_TYPES.includes(product.productType)) {
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

    // A cancelled order no longer represents a real debt — remove its SALE ledger entry so it
    // stops counting against the customer's pending balance. Any payment already collected is
    // left untouched (it becomes/stays credit, same as everywhere else in the ledger).
    await customerLedgerService.removeSaleDebit(sale.id, { transaction: t });

    // A cancelled order's courier record(s) would otherwise sit forever with their old
    // status/pending:true, permanently inflating the Outgoing Couriers "Pending" count — mark
    // them CANCELLED (and pending:false) too. A courier that already reached DONE (already
    // shipped/delivered before this cancellation) is left alone.
    const couriersToCancel = await Courier.findAll({
      where: { saleId: sale.id, status: { [Op.ne]: "DONE" } },
      attributes: ["entryDate"],
      transaction: t,
    });
    await Courier.update(
      { status: "CANCELLED", pending: false },
      { where: { saleId: sale.id, status: { [Op.ne]: "DONE" } }, transaction: t }
    );
    // A CANCELLED courier drops out of the Courier Charge sum too — recalc whichever month(s)
    // it belonged to.
    await recalculateCourierChargeForDates(couriersToCancel.map((c) => c.entryDate), { transaction: t });

    // A cancelled order no longer represents real income — remove its linked Account →
    // Income entry so the daily balance stops counting it (see
    // incomeSync.service.js#removeIncomeForSale).
    const removedIncomeDate = await removeIncomeForSale(sale.id, { transaction: t });

    await t.commit();

    if (removedIncomeDate) await recalculateDay(removedIncomeDate);

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

    // Same courier-count fix as cancelOrder, scoped to this one line item's courier record(s).
    const itemCouriersToCancel = await Courier.findAll({
      where: { saleItemId: item.id, status: { [Op.ne]: "DONE" } },
      attributes: ["entryDate"],
      transaction: t,
    });
    await Courier.update(
      { status: "CANCELLED", pending: false },
      { where: { saleItemId: item.id, status: { [Op.ne]: "DONE" } }, transaction: t }
    );
    await recalculateCourierChargeForDates(itemCouriersToCancel.map((c) => c.entryDate), { transaction: t });

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

// Adds a new product line to an existing, non-cancelled Sale — lets a Sales member finish
// filling in a Sale after the fact (e.g. a Lead-originated Sale that started with just one
// placeholder line — see lead.controller.js#ensureSaleForLead). Mirrors the per-item logic in
// createOrder: reserves stock and, only if the sale already has active Courier tracking for its
// other lines (mirroring whatever "Create Courier Entry" currently resolves to for this sale —
// see setCourierEntryForSale), adds this line to the same shipment group; otherwise fulfills
// whatever was allocated directly, same as a courier-less sale.
const addOrderItem = async ({ saleId, productId, quantity, sellingPrice, serialNumbers, userId }) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }
    if (sale.status === "CANCELLED") {
      const err = new Error("Cannot add items to a cancelled sale");
      err.statusCode = 400;
      throw err;
    }

    const requested = parseInt(quantity);
    if (!productId || !requested || requested < 1) {
      const err = new Error("A valid productId and quantity >= 1 are required");
      err.statusCode = 400;
      throw err;
    }

    const product = await Product.findByPk(productId, { transaction: t });
    if (!product) {
      const err = new Error(`Product ID ${productId} not found`);
      err.statusCode = 404;
      throw err;
    }
    if (serialNumbers && product.productType !== "SERIALIZED") {
      const err = new Error(`${product.name} is not a serial-tracked product — remove the selected serial numbers`);
      err.statusCode = 400;
      throw err;
    }
    if (serialNumbers && serialNumbers.length !== requested) {
      const err = new Error(`Selected serial numbers (${serialNumbers.length}) must match the quantity (${requested})`);
      err.statusCode = 400;
      throw err;
    }

    const saleItem = await SaleItem.create(
      {
        saleId: sale.id,
        productId,
        quantity: requested,
        sellingPrice: parseFloat(sellingPrice) || 0,
        fulfillmentStatus: "PENDING",
        allocatedQuantity: 0,
        fulfilledQuantity: 0,
        backorderedQuantity: 0,
      },
      { transaction: t }
    );

    const reserveResult = await inventoryService.reserveStock(
      { productId, saleItemId: saleItem.id, quantity: requested, userId, serialNumbers },
      { transaction: t }
    );
    saleItem.allocatedQuantity = reserveResult.allocated;
    saleItem.backorderedQuantity = reserveResult.backordered;
    saleItem.fulfillmentStatus = inventoryService.computeItemFulfillmentStatus(saleItem);
    await saleItem.save({ transaction: t });

    const existingActiveCourier = await Courier.findOne({
      where: { saleId: sale.id, status: { [Op.ne]: "CANCELLED" } },
      transaction: t,
    });

    let courier = null;
    if (existingActiveCourier && product.productType !== "SOFTWARE") {
      const shipmentGroupId = existingActiveCourier.shipmentGroupId || `SALE-${sale.id}`;
      const ready = saleItem.backorderedQuantity === 0;
      courier = await Courier.create(
        {
          customerName: sale.customerName,
          name: sale.customerName,
          address: sale.fromAddress || null,
          city: sale.city || null,
          mobileNo: sale.customerNumber,
          phone: sale.customerNumber,
          productName: product.name,
          quantity: requested,
          pending: true,
          status: ready ? "PENDING" : "WAITING_FOR_STOCK",
          productStockStatus: ready ? "IN_STOCK" : "OUT_OF_STOCK",
          courierName: sale.courierName || null,
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
      if (ready) {
        await inventoryService.tryFulfillReadyGroup(shipmentGroupId, { userId, transaction: t });
      }
    } else if (saleItem.allocatedQuantity > 0) {
      await inventoryService.fulfillStock(
        { productId, saleItemId: saleItem.id, quantity: saleItem.allocatedQuantity, userId },
        { transaction: t }
      );
    }

    await inventoryService.recomputeSaleFulfillmentStatus(sale.id, { transaction: t });
    await saleItem.reload({ transaction: t });

    await t.commit();
    return { ...saleItem.toJSON(), productName: product.name, productType: product.productType, courierId: courier ? courier.id : null };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Updates an existing, non-cancelled line item's price and/or quantity — the other half of
// letting a Sales member finish a Sale after the fact (see addOrderItem above). Price never
// touches stock. A quantity increase reserves the extra units (backordering whatever isn't
// available, same as a fresh order line); a decrease releases whatever's still only reserved —
// it can never drop below what's already been shipped (use the dedicated Return flow for that).
const updateOrderItem = async ({ saleId, saleItemId, quantity, sellingPrice, userId }) => {
  const t = await sequelize.transaction();
  try {
    const item = await SaleItem.findOne({ where: { id: saleItemId, saleId }, transaction: t, lock: true });
    if (!item) {
      const err = new Error("Order item not found");
      err.statusCode = 404;
      throw err;
    }
    if (item.fulfillmentStatus === "CANCELLED") {
      const err = new Error("Cannot edit a cancelled order item");
      err.statusCode = 400;
      throw err;
    }

    if (sellingPrice !== undefined) {
      item.sellingPrice = parseFloat(sellingPrice) || 0;
    }

    let newlyAllocated = 0;
    if (quantity !== undefined) {
      const newQuantity = parseInt(quantity);
      if (!newQuantity || newQuantity < 1) {
        const err = new Error("quantity must be at least 1");
        err.statusCode = 400;
        throw err;
      }
      if (newQuantity < item.fulfilledQuantity) {
        const err = new Error(`Cannot set quantity below the ${item.fulfilledQuantity} unit(s) already shipped — use Return instead`);
        err.statusCode = 400;
        throw err;
      }

      const delta = newQuantity - item.quantity;
      if (delta > 0) {
        const reserveResult = await inventoryService.reserveStock(
          { productId: item.productId, saleItemId: item.id, quantity: delta, userId },
          { transaction: t }
        );
        item.allocatedQuantity += reserveResult.allocated;
        item.backorderedQuantity += reserveResult.backordered;
        newlyAllocated = reserveResult.allocated;
      } else if (delta < 0) {
        let toRelease = -delta;
        const releaseFromBackorder = Math.min(toRelease, item.backorderedQuantity);
        item.backorderedQuantity -= releaseFromBackorder;
        toRelease -= releaseFromBackorder;
        if (toRelease > 0) {
          await inventoryService.releaseReservation(
            { productId: item.productId, saleItemId: item.id, quantity: toRelease, userId, reason: "Order item quantity reduced" },
            { transaction: t }
          );
          item.allocatedQuantity -= toRelease;
        }
      }
      item.quantity = newQuantity;
    }

    item.fulfillmentStatus = inventoryService.computeItemFulfillmentStatus(item);
    await item.save({ transaction: t });

    if (quantity !== undefined) {
      const courier = await Courier.findOne({ where: { saleItemId: item.id, status: { [Op.ne]: "CANCELLED" } }, transaction: t });
      if (courier) {
        courier.quantity = item.quantity;
        const ready = item.backorderedQuantity === 0;
        if (courier.status !== "DONE") {
          courier.status = ready ? "PENDING" : "WAITING_FOR_STOCK";
          courier.productStockStatus = ready ? "IN_STOCK" : "OUT_OF_STOCK";
        }
        await courier.save({ transaction: t });
        if (ready && courier.shipmentGroupId) {
          await inventoryService.tryFulfillReadyGroup(courier.shipmentGroupId, { userId, transaction: t });
        }
      } else if (newlyAllocated > 0) {
        // No courier tracking this line — fulfill the newly-reserved units directly, same as
        // createOrder's courier-less path.
        await inventoryService.fulfillStock(
          { productId: item.productId, saleItemId: item.id, quantity: newlyAllocated, userId },
          { transaction: t }
        );
      }
    }

    await inventoryService.recomputeSaleFulfillmentStatus(saleId, { transaction: t });
    await item.reload({ transaction: t });

    await t.commit();
    return item;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Toggles whether a Sale has Courier (shipment-tracking) record(s) for its items — lets the
// "Create Courier Entry" checkbox be flipped after the sale already exists (see
// sells.controller.js#updateSale). Never touches stock/fulfillment (that's already resolved at
// creation time — see createOrder above), and is idempotent in both directions: turning on only
// creates a row for an item that doesn't already have an active one (no duplicates), and turning
// off only cancels currently-active (non-DONE) rows, leaving already-shipped ones as history.
const setCourierEntryForSale = async ({ saleId, createCourierEntry, userId }, { transaction: t }) => {
  const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
  if (!sale) {
    const err = new Error("Sale not found");
    err.statusCode = 404;
    throw err;
  }

  const items = await SaleItem.findAll({
    where: { saleId, fulfillmentStatus: { [Op.ne]: "CANCELLED" } },
    transaction: t,
  });
  const existingActiveCouriers = await Courier.findAll({
    where: { saleId, status: { [Op.ne]: "CANCELLED" } },
    transaction: t,
  });

  if (createCourierEntry) {
    const itemsWithCourier = new Set(existingActiveCouriers.map((c) => c.saleItemId));
    const shipmentGroupId = `SALE-${sale.id}`;

    for (const item of items) {
      if (itemsWithCourier.has(item.id)) continue;

      const product = await Product.findByPk(item.productId, { transaction: t });
      // SOFTWARE lines are fulfilled directly at creation/add time (see createOrder/addOrderItem)
      // and must never get a Courier, even retroactively when this flag is toggled back on.
      if (product && product.productType === "SOFTWARE") continue;
      // No outstanding backorder means this line's stock need was already fully resolved at
      // creation (either reserved-and-waiting or already fulfilled directly, since no courier
      // existed to defer fulfillment) — either way there's nothing left to wait on here.
      const ready = item.backorderedQuantity === 0;

      await Courier.create(
        {
          customerName: sale.customerName,
          name: sale.customerName,
          address: sale.fromAddress || null,
          city: sale.city || null,
          mobileNo: sale.customerNumber,
          phone: sale.customerNumber,
          productName: product ? product.name : null,
          quantity: item.quantity,
          pending: true,
          status: ready ? "PENDING" : "WAITING_FOR_STOCK",
          productStockStatus: ready ? "IN_STOCK" : "OUT_OF_STOCK",
          courierName: sale.courierName || null,
          trackId: null,
          direction: "OUT",
          userId,
          saleId: sale.id,
          saleItemId: item.id,
          shipmentGroupId,
          shipmentType: "SHIP_COMPLETE",
        },
        { transaction: t }
      );
    }
  } else if (existingActiveCouriers.length > 0) {
    // A courier that already reached DONE (already shipped/delivered) is left alone — same rule
    // as cancelOrder's courier handling.
    const cancellable = existingActiveCouriers.filter((c) => c.status !== "DONE");
    if (cancellable.length > 0) {
      const entryDates = cancellable.map((c) => c.entryDate);
      await Courier.update(
        { status: "CANCELLED", pending: false },
        { where: { id: { [Op.in]: cancellable.map((c) => c.id) } }, transaction: t }
      );
      await recalculateCourierChargeForDates(entryDates, { transaction: t });
    }
  }
};

module.exports = {
  computePaymentStatus,
  normalizeBankPayments,
  createOrder,
  recordPayment,
  cancelOrder,
  cancelOrderItem,
  returnItem,
  addOrderItem,
  updateOrderItem,
  setCourierEntryForSale,
};
