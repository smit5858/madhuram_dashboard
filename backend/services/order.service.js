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

// Every real payment method a single Payment row (or Sale.paymentMethod, when only one method was
// used) can be. "COD" was retired in favor of "Cash" — see server.js#ensureCodPaymentMethodBackfilled
// for the one-time data migration. "Multiple" is a separate, derived-only Sale.paymentMethod value
// (see recomputeSalePaymentMethod below) — it can never be assigned to a single Payment row.
const VALID_PAYMENT_METHODS = ["Cash", "UPI", "Card", "BankTransfer", "Other"];

// Total amount actually owed on a sale — selling amount plus courier/shipping charge. This is
// the figure payments are measured against everywhere (pendingAmount, paymentStatus, "how much
// is left to collect"), not sellingAmount alone.
const computeOrderTotal = (sellingAmount, courierCharge) => (parseFloat(sellingAmount) || 0) + (parseFloat(courierCharge) || 0);

// Validates and normalizes a `payments` array — the multi-payment-method entry point used by both
// createOrder (initial payment(s) on a brand-new sale) and applyPaymentsToSale (topping up an
// existing sale). Each row is {method, amount, bankAccountId?, transactionRef?, notes?}; zero-amount
// rows are silently dropped (a blank row left in the UI is not an error — see the "Handle zero/empty
// payment amounts" requirement this mirrors). BankTransfer/UPI rows must name a bank account once
// their amount is positive, matching normalizeBankPayments' server-side check for the same two
// methods. `allowNegative` lets a row correct an over-collection (a negative amount) — used by
// applyPaymentsToSale/recordPayments, never by createOrder (a brand-new sale has nothing to correct
// yet). Overpaying against the order total is allowed and must never block submission — the caller
// (applyPaymentsToSale/createOrder) is responsible for clamping pendingAmount at 0 and surfacing the
// extra as an overpaid amount, not for rejecting the payment.
const normalizePayments = (payments, { allowNegative = false } = {}) => {
  const rows = (Array.isArray(payments) ? payments : [])
    .map((p) => ({
      method: p && p.method,
      amount: p ? parseFloat(p.amount) || 0 : 0,
      bankAccountId: p && p.bankAccountId ? Number(p.bankAccountId) : null,
      transactionRef: p && p.transactionRef ? String(p.transactionRef).trim() || null : null,
      notes: p && p.notes ? String(p.notes).trim() || null : null,
    }))
    .filter((row) => row.amount !== 0);

  for (const row of rows) {
    if (!VALID_PAYMENT_METHODS.includes(row.method)) {
      const err = new Error("Each payment must have a valid payment method");
      err.statusCode = 400;
      throw err;
    }
    if (!allowNegative && row.amount <= 0) {
      const err = new Error("Each payment amount must be greater than 0");
      err.statusCode = 400;
      throw err;
    }
    if (needsBankSplit(row.method) && row.amount > 0 && !row.bankAccountId) {
      const err = new Error(`Select a bank account for the ${row.method} payment`);
      err.statusCode = 400;
      throw err;
    }
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return { rows, total };
};

// Recomputes a Sale's header paymentMethod from the actual set of Payment rows recorded against
// it: null when nothing's been collected yet, the single method when only one was used, or
// "Multiple" once more than one distinct method contributed to collectedAmount. The itemized
// breakdown always lives in the Payment rows themselves — this is only a quick-glance summary for
// the sales list/export/notifications. Must run inside the same transaction as whatever just
// created/removed Payment rows for this sale.
const recomputeSalePaymentMethod = async (saleId, { transaction: t }) => {
  const rows = await Payment.findAll({ where: { saleId }, attributes: ["method"], group: ["method"], transaction: t, raw: true });
  const methods = rows.map((r) => r.method).filter(Boolean);
  return methods.length === 0 ? null : methods.length === 1 ? methods[0] : "Multiple";
};

// Applies a batch of new payment entries to an already-loaded, locked `sale` instance: creates one
// Payment row per entry, updates collectedAmount/pendingAmount/paymentStatus/paymentMethod/
// bankAccountId on `sale` (the caller is responsible for sale.save()), and logs a matching customer
// ledger entry per row (recordPayment for a positive amount, recordAdjustment for a negative
// correction) — same per-entry pairing createOrder uses for a brand-new sale's initial payment(s).
// Shared by recordPayments (its own transaction) and updateSale (already inside one). Returns the
// normalized rows that were actually applied (empty if every row was zero-amount).
const applyPaymentsToSale = async (sale, payments, { userId, allowNegative = true } = {}, { transaction: t }) => {
  const { rows, total } = normalizePayments(payments, { allowNegative });
  if (rows.length === 0) return rows;

  const orderTotal = computeOrderTotal(sale.sellingAmount, sale.courierCharge);
  const newCollected = Math.max(0, parseFloat(sale.collectedAmount) + total);
  sale.collectedAmount = newCollected;
  sale.pendingAmount = Math.max(0, orderTotal - newCollected);
  sale.paymentStatus = computePaymentStatus({
    sellingAmount: parseFloat(sale.sellingAmount),
    collectedAmount: newCollected,
    refundedAmount: parseFloat(sale.refundedAmount),
    courierCharge: parseFloat(sale.courierCharge) || 0,
  });

  // Keeps each created Payment row paired with the row that produced it, so the mirrored
  // customer-ledger entry below can be linked back to it (see CustomerLedgerEntry.paymentId) —
  // needed for updatePayment/deletePayment to find and adjust the right ledger entry later.
  const createdPayments = [];
  for (const row of rows) {
    const payment = await Payment.create(
      {
        saleId: sale.id,
        amount: row.amount,
        method: row.method,
        bankAccountId: row.bankAccountId,
        transactionRef: row.transactionRef,
        notes: row.notes,
        createdBy: userId,
      },
      { transaction: t }
    );
    createdPayments.push(payment);
    if (row.bankAccountId && !sale.bankAccountId) sale.bankAccountId = row.bankAccountId;
  }

  sale.paymentMethod = await recomputeSalePaymentMethod(sale.id, { transaction: t });

  if (sale.customerId) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ledgerRecordFn = row.amount > 0 ? customerLedgerService.recordPayment : customerLedgerService.recordAdjustment;
      await ledgerRecordFn(
        {
          customerId: sale.customerId,
          saleId: sale.id,
          paymentId: createdPayments[i].id,
          amount: row.amount,
          paymentMethod: row.method,
          bankAccountId: row.bankAccountId,
          bankPayments: row.bankAccountId ? [{ bankAccountId: row.bankAccountId, amount: Math.abs(row.amount) }] : [],
          note: row.notes,
          userId,
        },
        { transaction: t }
      );
    }
  }

  return rows;
};

// Edits one existing Payment row directly (as opposed to applyPaymentsToSale, which only ever
// adds new rows) — e.g. correcting a mistyped amount or the wrong method on a payment already
// recorded against a sale. Recomputes collectedAmount as the true SUM of every remaining Payment
// row (not a delta) so it can never drift, then pendingAmount/paymentStatus/paymentMethod off of
// that. Only ever touches a payment already > 0 and never sets it to <= 0 — a correction that
// needs to zero out or reverse a payment is what the negative-row path in applyPaymentsToSale is
// for; this endpoint is for fixing a genuine data-entry mistake on a real payment. Leaves
// SaleBankAccount (the separate, independent bank-split allocation table) untouched, same as
// every other payment-mutating path except an explicit `bankPayments` edit on updateSale.
const updatePayment = async ({ saleId, paymentId, amount, method, bankAccountId, transactionRef, notes, canViewAll, userId }) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }
    if (!canViewAll && sale.createdBy !== userId) {
      const err = new Error("Forbidden: You do not have permission to update this sale");
      err.statusCode = 403;
      throw err;
    }

    const payment = await Payment.findOne({ where: { id: paymentId, saleId }, transaction: t, lock: true });
    if (!payment) {
      const err = new Error("Payment not found");
      err.statusCode = 404;
      throw err;
    }

    const parsedAmount = amount !== undefined ? parseFloat(amount) : parseFloat(payment.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      const err = new Error("Payment amount must be greater than 0");
      err.statusCode = 400;
      throw err;
    }
    const resolvedMethod = method !== undefined ? method : payment.method;
    if (!VALID_PAYMENT_METHODS.includes(resolvedMethod)) {
      const err = new Error("Each payment must have a valid payment method");
      err.statusCode = 400;
      throw err;
    }
    const resolvedBankAccountId = bankAccountId !== undefined ? (bankAccountId ? Number(bankAccountId) : null) : payment.bankAccountId;
    if (needsBankSplit(resolvedMethod) && !resolvedBankAccountId) {
      const err = new Error(`Select a bank account for the ${resolvedMethod} payment`);
      err.statusCode = 400;
      throw err;
    }

    payment.amount = parsedAmount;
    payment.method = resolvedMethod;
    payment.bankAccountId = resolvedBankAccountId;
    if (transactionRef !== undefined) payment.transactionRef = transactionRef ? String(transactionRef).trim() || null : null;
    if (notes !== undefined) payment.notes = notes ? String(notes).trim() || null : null;
    await payment.save({ transaction: t });

    const totalCollected = parseFloat(await Payment.sum("amount", { where: { saleId: sale.id }, transaction: t })) || 0;
    const orderTotal = computeOrderTotal(sale.sellingAmount, sale.courierCharge);
    sale.collectedAmount = totalCollected;
    sale.pendingAmount = Math.max(0, orderTotal - totalCollected);
    sale.paymentStatus = computePaymentStatus({
      sellingAmount: parseFloat(sale.sellingAmount),
      collectedAmount: totalCollected,
      refundedAmount: parseFloat(sale.refundedAmount),
      courierCharge: parseFloat(sale.courierCharge) || 0,
    });
    sale.paymentMethod = await recomputeSalePaymentMethod(sale.id, { transaction: t });
    await sale.save({ transaction: t });

    // Keep the mirrored customer-ledger entry (if any — see CustomerLedgerEntry.paymentId) in
    // sync so the Debited/Ledger screen never shows stale numbers for a payment edited here.
    if (sale.customerId) {
      const entry = await customerLedgerService.findEntryByPaymentId(payment.id, { transaction: t });
      if (entry) {
        await customerLedgerService.updateEntry(
          { entryId: entry.id, amount: parsedAmount, paymentMethod: resolvedMethod, reference: payment.transactionRef },
          { transaction: t }
        );
        entry.bankAccountId = needsBankSplit(resolvedMethod) ? resolvedBankAccountId : null;
        await entry.save({ transaction: t });
      }
    }

    await t.commit();
    return sale;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

// Removes one existing Payment row outright (e.g. it was recorded in error) and recomputes the
// sale's collectedAmount/pendingAmount/paymentStatus/paymentMethod, plus removes the mirrored
// customer-ledger entry if one exists — same SUM-based recompute and SaleBankAccount hands-off
// as updatePayment above.
const deletePayment = async ({ saleId, paymentId, canViewAll, userId }) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }
    if (!canViewAll && sale.createdBy !== userId) {
      const err = new Error("Forbidden: You do not have permission to update this sale");
      err.statusCode = 403;
      throw err;
    }

    const payment = await Payment.findOne({ where: { id: paymentId, saleId }, transaction: t, lock: true });
    if (!payment) {
      const err = new Error("Payment not found");
      err.statusCode = 404;
      throw err;
    }

    await payment.destroy({ transaction: t });

    const totalCollected = parseFloat(await Payment.sum("amount", { where: { saleId: sale.id }, transaction: t })) || 0;
    const orderTotal = computeOrderTotal(sale.sellingAmount, sale.courierCharge);
    sale.collectedAmount = totalCollected;
    sale.pendingAmount = Math.max(0, orderTotal - totalCollected);
    sale.paymentStatus = computePaymentStatus({
      sellingAmount: parseFloat(sale.sellingAmount),
      collectedAmount: totalCollected,
      refundedAmount: parseFloat(sale.refundedAmount),
      courierCharge: parseFloat(sale.courierCharge) || 0,
    });
    sale.paymentMethod = await recomputeSalePaymentMethod(sale.id, { transaction: t });
    await sale.save({ transaction: t });

    if (sale.customerId) {
      const entry = await customerLedgerService.findEntryByPaymentId(payment.id, { transaction: t });
      if (entry) await customerLedgerService.deleteEntry({ entryId: entry.id }, { transaction: t });
    }

    await t.commit();
    return sale;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

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

// `courierCharge` is optional (defaults to 0) so existing callers that don't have it in scope
// keep working — but PAID must reflect the full order total (selling + courier), not selling alone.
const computePaymentStatus = ({ sellingAmount, collectedAmount, refundedAmount, courierCharge = 0 }) => {
  const orderTotal = computeOrderTotal(sellingAmount, courierCharge);
  if (refundedAmount > 0 && refundedAmount >= collectedAmount) return "REFUNDED";
  if (refundedAmount > 0 && refundedAmount < collectedAmount) return "PARTIALLY_REFUNDED";
  if (collectedAmount <= 0) return "UNPAID";
  if (collectedAmount < orderTotal) return "PARTIALLY_PAID";
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
  payments,
  city,
  fromAddress,
  pincode,
  sellingAmount,
  collectedAmount,
  notes,
  saleDate,
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

    // Two ways to submit how a sale was paid for: the current multi-payment-method `payments`
    // array (e.g. part Cash, part UPI on the same order — see normalizePayments), or the older
    // single paymentMethod + collectedAmount shape (still used by callers that never collect
    // anything up front, e.g. lead.controller.js#ensureSaleForLead's placeholder sale). Whichever
    // is given, `paymentRows` ends up as the normalized list of {method, amount, bankAccountId,
    // transactionRef} entries to create one Payment row for each of, and `collected` as their sum.
    let paymentRows;
    let collected;
    let bankPaymentRows;
    if (payments !== undefined) {
      const normalized = normalizePayments(payments);
      paymentRows = normalized.rows;
      collected = normalized.total;
      // Derived purely so the legacy sale_bank_accounts table / bankAccountId column (and the
      // customer ledger's own bank-split, further below) keep reflecting reality for any reader
      // that still relies on them — every bank-routed entry becomes one allocation row.
      bankPaymentRows = paymentRows.filter((row) => row.bankAccountId).map((row) => ({ bankAccountId: row.bankAccountId, amount: row.amount }));
    } else {
      collected = parseFloat(collectedAmount) || 0;
      // Bank Account field — shown every time regardless of Payment Method, optional, and lets
      // the collected amount be split across multiple bank accounts (each with its own amount —
      // see saleBankAccount.model.js).
      bankPaymentRows = normalizeBankPayments(bankPayments, collected, paymentMethod);
      paymentRows =
        collected > 0
          ? [{ method: paymentMethod || null, amount: collected, bankAccountId: bankPaymentRows[0]?.bankAccountId || null, transactionRef: null, notes: null }]
          : [];
    }

    const orderTotal = computeOrderTotal(selling, parsedCourierCharge);
    const pending = Math.max(0, orderTotal - collected);
    const paymentStatus = computePaymentStatus({ sellingAmount: selling, collectedAmount: collected, refundedAmount: 0, courierCharge: parsedCourierCharge });
    // bankAccountId is kept in sync as the first allocation's bank for any reader that still
    // uses the legacy single-account column.
    const bankAccountId = bankPaymentRows[0]?.bankAccountId || null;
    // Read-only quick-glance summary — null (nothing collected yet), the single method used, or
    // "Multiple" once the payments array named more than one distinct method.
    const saleHeaderPaymentMethod = paymentRows.length === 0 ? null : paymentRows.length === 1 ? paymentRows[0].method : "Multiple";

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
        paymentMethod: saleHeaderPaymentMethod,
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
        saleDate: saleDate || dayjs().format("YYYY-MM-DD"),
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

    // Kept paired with the row that produced each one, so the ledger entries created below (and
    // any later edit/delete via updatePayment/deletePayment) can be linked back to it — see
    // CustomerLedgerEntry.paymentId and applyPaymentsToSale's identical pairing above.
    const createdPayments = [];
    for (const row of paymentRows) {
      const payment = await Payment.create(
        {
          saleId: sale.id,
          amount: row.amount,
          method: row.method || null,
          bankAccountId: row.bankAccountId || null,
          transactionRef: row.transactionRef || null,
          notes: row.notes || null,
          createdBy: userId,
        },
        { transaction: t }
      );
      createdPayments.push(payment);
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

      const trimmedItemNotes = item.notes ? String(item.notes).trim() : null;
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
          notes: trimmedItemNotes,
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
              // Without this, entryDate stays NULL — a date-range filter (Op.gte/Op.lte) never
              // matches a NULL column, so this row would silently never appear under any date
              // filter no matter what date is picked.
              entryDate: dayjs().format("YYYY-MM-DD"),
              direction: "OUT",
              userId,
              saleId: sale.id,
              saleItemId: saleItem.id,
              shipmentGroupId,
              shipmentType: "SHIP_COMPLETE",
              note: trimmedItemNotes,
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
      // One ledger PAYMENT entry per payment method — mirrors the itemized Payment rows above so
      // a split payment (e.g. part Cash, part UPI) shows up as two distinct ledger lines instead
      // of one entry with a misleading single method.
      for (let i = 0; i < paymentRows.length; i++) {
        const row = paymentRows[i];
        await customerLedgerService.recordPayment(
          {
            customerId: finalCustomerId,
            saleId: sale.id,
            paymentId: createdPayments[i].id,
            amount: row.amount,
            paymentMethod: row.method || null,
            bankPayments: row.bankAccountId ? [{ bankAccountId: row.bankAccountId, amount: row.amount }] : [],
            userId,
          },
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
              message: `Customer: ${customerName}\nCity: ${city || "—"}\nProducts: ${productSummary}\nAmount: ₹${selling.toFixed(2)}\nPayment: ${saleHeaderPaymentMethod || "—"}`,
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

// Records one or more payments/deposits against an existing sale in a single transaction — e.g.
// the remaining ₹2,000 on a partially-paid order collected as ₹1,000 Cash + ₹1,000 UPI at once.
// Never touches stock or fulfillment — payment and fulfillment are fully independent state
// machines. A row with a negative amount corrects an earlier over-collection (see
// normalizePayments' `allowNegative`) rather than recording a new payment.
const recordPayments = async ({ saleId, payments, userId }) => {
  const t = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) {
      const err = new Error("Sale not found");
      err.statusCode = 404;
      throw err;
    }

    const rows = await applyPaymentsToSale(sale, payments, { userId }, { transaction: t });
    if (rows.length === 0) {
      const err = new Error("At least one valid payment entry is required");
      err.statusCode = 400;
      throw err;
    }

    await sale.save({ transaction: t });
    await t.commit();

    const totalReceived = rows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
    if (totalReceived > 0) {
      const methodsSummary = rows
        .filter((row) => row.amount > 0)
        .map((row) => `${row.method}: ₹${row.amount.toFixed(2)}`)
        .join(", ");
      await notify([
        {
          recipientModule: "account",
          type: "PAYMENT_RECEIVED",
          title: "Payment Received",
          message: `Invoice ${sale.invoiceNumber}: ₹${totalReceived.toFixed(2)} received (${methodsSummary})`,
          referenceType: "sale",
          referenceId: sale.id,
          event: "payment_received",
          payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber, collectedAmount: sale.collectedAmount, pendingAmount: sale.pendingAmount, paymentStatus: sale.paymentStatus } },
        },
        {
          recipientModule: "admin",
          type: "PAYMENT_RECEIVED",
          title: "Payment Received",
          message: `Invoice ${sale.invoiceNumber}: ₹${totalReceived.toFixed(2)} received (${methodsSummary})`,
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

// Single-entry convenience wrapper around recordPayments, kept for the simple "record one
// payment" call shape used by sells.controller.js#recordPayment.
const recordPayment = ({ saleId, amount, method, bankAccountId, transactionRef, userId, notes }) =>
  recordPayments({ saleId, payments: [{ amount, method, bankAccountId, transactionRef, notes }], userId });

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
        courierCharge: parseFloat(sale.courierCharge) || 0,
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

// Creates a one-off, non-master (isMasterProduct: false) HARDWARE_ORDER_BASED Product + Stock row
// to back a single "Quick Add Product" line on a sale (see QuickAddProductModal.tsx) — reuses the
// exact same scoped-product mechanism as the pinned "Other" placeholder product. Lives here (and is
// gated only by /sells "update" permission in sells.routes.js) rather than behind POST /products'
// "create" permission, since this never touches the master product catalog and is really a
// sells-flow action, not a Products-module one — a Sales employee with sells access but no
// Products-module access must still be able to use it.
const quickAddProduct = async ({ name }) => {
  const trimmedName = name ? String(name).trim() : "";
  if (!trimmedName) {
    const err = new Error("Product name is required");
    err.statusCode = 400;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const product = await Product.create(
      { name: trimmedName, productType: "HARDWARE_ORDER_BASED", isMasterProduct: false },
      { transaction: t }
    );
    await Stock.create(
      { productId: product.id, quantity: 0, reserved: 0, purchasePrice: null, sellingPrice: null, dealerId: null },
      { transaction: t }
    );
    await t.commit();
    return { id: product.id, name: product.name, productType: product.productType, isMasterProduct: product.isMasterProduct };
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === "SequelizeUniqueConstraintError") {
      const dupErr = new Error("A product with this name already exists");
      dupErr.statusCode = 409;
      throw dupErr;
    }
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
const addOrderItem = async ({ saleId, productId, quantity, sellingPrice, serialNumbers, notes, userId }) => {
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

    const trimmedItemNotes = notes ? String(notes).trim() : null;
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
        notes: trimmedItemNotes,
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
          entryDate: dayjs().format("YYYY-MM-DD"),
          direction: "OUT",
          userId,
          saleId: sale.id,
          saleItemId: saleItem.id,
          shipmentGroupId,
          shipmentType: "SHIP_COMPLETE",
          note: trimmedItemNotes,
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
const updateOrderItem = async ({ saleId, saleItemId, quantity, sellingPrice, notes, userId }) => {
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
    if (notes !== undefined) {
      item.notes = notes ? String(notes).trim() : null;
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
          entryDate: dayjs().format("YYYY-MM-DD"),
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
  computeOrderTotal,
  computePaymentStatus,
  normalizeBankPayments,
  normalizePayments,
  applyPaymentsToSale,
  createOrder,
  recordPayment,
  recordPayments,
  updatePayment,
  deletePayment,
  cancelOrder,
  cancelOrderItem,
  returnItem,
  quickAddProduct,
  addOrderItem,
  updateOrderItem,
  setCourierEntryForSale,
};
