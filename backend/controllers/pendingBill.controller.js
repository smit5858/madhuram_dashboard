const { PendingBill, PendingBillPayment, AccountEntry, Product, Dealer, User, BankAccount } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { recalculateDay } = require("../services/dailyBalance.service");
const pendingBillService = require("../services/pendingBill.service");
const { notify } = require("../services/notification.service");
const { accountKeyFor, accountNameFor, normalizeAccountKey } = require("../helper/pendingBillAccount");

const { EPSILON, round2, isLive } = pendingBillService;

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const formatRupees = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;

const BILL_INCLUDE = [
  { model: Product, attributes: ["id", "name"] },
  { model: Dealer, as: "dealer", attributes: ["id", "name"] },
  { model: User, as: "creator", attributes: ["id", "name"] },
  { model: User, as: "approver", attributes: ["id", "name"] },
];

const PAYMENT_INCLUDE = [
  { model: User, as: "creator", attributes: ["id", "name"] },
  { model: User, as: "verifier", attributes: ["id", "name"] },
  { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
];

const VALID_STATUSES = ["PENDING", "PARTIALLY_PAID", "PENDING_VERIFICATION", "APPROVED", "REJECTED", "CANCELLED"];
const VALID_PAYMENT_METHODS = ["Cash", "UPI", "Card", "BankTransfer", "Other"];
// BankTransfer/UPI need a configured bank account named ("Select Bank") — matches
// order.service.js#needsBankSplit's same two methods.
const needsBankAccount = (paymentMethod) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

const serializePendingBill = (row) => ({
  id: row.id,
  billType: row.billType,
  name: row.name,
  dealerName: row.dealerName,
  accountKey: row.accountKey,
  amount: row.amount,
  billDate: row.billDate,
  description: row.description,
  productId: row.productId,
  product: row.Product || null,
  productNameSnapshot: row.productNameSnapshot,
  dealerId: row.dealerId,
  dealer: row.dealer || null,
  quantity: row.quantity,
  purchasePrice: row.purchasePrice,
  billNumber: row.billNumber,
  paidAmount: row.paidAmount,
  remainingAmount: row.remainingAmount,
  status: row.status,
  approvedBy: row.approvedBy,
  approvedAt: row.approvedAt,
  creator: row.creator || null,
  approver: row.approver || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  payments: row.payments ? row.payments.map(serializePayment) : undefined,
});

function serializePayment(p) {
  return {
    id: p.id,
    pendingBillId: p.pendingBillId,
    accountKey: p.accountKey,
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    paymentDate: p.paymentDate,
    transactionRef: p.transactionRef,
    bankAccountId: p.bankAccountId,
    bankAccount: p.bankAccount || null,
    notes: p.notes,
    status: p.status,
    createdBy: p.createdBy,
    creator: p.creator || null,
    verifiedBy: p.verifiedBy,
    verifier: p.verifier || null,
    verifiedAt: p.verifiedAt,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const buildPendingBillWhere = (query) => {
  const { search, status, billType, startDate, endDate } = query;
  const where = {};

  if (status && VALID_STATUSES.includes(status)) where.status = status;
  if (billType && ["GENERAL", "RESTOCK"].includes(billType)) where.billType = billType;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { dealerName: { [Op.like]: term } },
      { billNumber: { [Op.like]: term } },
    ];
  }

  if (startDate && endDate) {
    where.billDate = { [Op.between]: [startDate, endDate] };
  } else if (startDate) {
    where.billDate = { [Op.gte]: startDate };
  } else if (endDate) {
    where.billDate = { [Op.lte]: endDate };
  }

  return where;
};

// GET /pending-bills?search=&status=&billType=&startDate=&endDate=&page=&limit=
exports.getPendingBills = async (req, res) => {
  try {
    const where = buildPendingBillWhere(req.query);
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await PendingBill.findAndCountAll({
      where,
      include: BILL_INCLUDE,
      order: [["billDate", "DESC"], ["createdAt", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: rows.map(serializePendingBill),
      meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// ─── Accounts (one per Seller/Dealer/Company — see helper/pendingBillAccount.js) ───────────────

const sumOf = (rows, pick) => round2(rows.reduce((total, row) => total + Number(pick(row)), 0));

// The account-level figures every account shows, from its bills (cancelled/rejected bills are
// history only — they never count toward what's billed, paid or owed).
const summarizeAccount = (accountKey, bills) => {
  const live = bills.filter(isLive);
  const outstanding = sumOf(live, (b) => b.remainingAmount);
  return {
    accountKey,
    name: accountNameFor(bills[0]),
    billCount: live.length,
    totalBilled: sumOf(live, (b) => b.amount),
    totalPaid: sumOf(live, (b) => b.paidAmount),
    outstanding,
    // Fully paid accounts drop out of the Active list but stay reachable under Settled / History.
    status: outstanding > EPSILON ? "PENDING" : "SETTLED",
  };
};

// GET /pending-bills/accounts?search=&status=PENDING|SETTLED&startDate=&endDate=&page=&limit=
// One row per account (highest outstanding first for Active, most recent activity first for
// Settled), mirroring customerLedger.service.js#getDebtors. Grouped in memory — the bill/payment
// tables are small — then paginated server-side.
exports.getPendingBillAccounts = async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    const status = req.query.status === "SETTLED" ? "SETTLED" : "PENDING";
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const bills = await PendingBill.findAll({
      attributes: ["id", "name", "dealerName", "accountKey", "amount", "paidAmount", "remainingAmount", "billDate", "billNumber", "status"],
      order: [["billDate", "ASC"], ["id", "ASC"]],
    });
    const payments = await PendingBillPayment.findAll({
      attributes: ["id", "pendingBillId", "accountKey", "paymentDate"],
      where: { status: "Verified" },
    });

    const groups = new Map();
    const keyByBillId = new Map();
    for (const bill of bills) {
      const key = bill.accountKey || accountKeyFor(bill);
      keyByBillId.set(bill.id, key);
      if (!groups.has(key)) groups.set(key, { bills: [], dates: [] });
      const group = groups.get(key);
      group.bills.push(bill);
      if (isLive(bill)) group.dates.push(bill.billDate);
    }
    for (const payment of payments) {
      const key = payment.pendingBillId != null ? keyByBillId.get(payment.pendingBillId) : payment.accountKey;
      if (key && groups.has(key)) groups.get(key).dates.push(payment.paymentDate);
    }

    const term = search && search.trim() ? search.trim().toLowerCase() : null;
    let accounts = [];
    for (const [key, group] of groups) {
      if (!group.bills.some(isLive)) continue;

      const summary = summarizeAccount(key, group.bills);
      if (summary.status !== status) continue;
      if (
        term &&
        !summary.name.toLowerCase().includes(term) &&
        !group.bills.some((b) => `${b.name} ${b.billNumber || ""}`.toLowerCase().includes(term))
      ) {
        continue;
      }
      // An account matches a date range if any of its bills or payments falls inside it.
      if ((startDate || endDate) && !group.dates.some((d) => (!startDate || d >= startDate) && (!endDate || d <= endDate))) continue;

      accounts.push({ ...summary, lastTransactionDate: group.dates.reduce((latest, d) => (d > latest ? d : latest), "") || null });
    }

    accounts.sort((a, b) =>
      status === "PENDING"
        ? b.outstanding - a.outstanding || a.name.localeCompare(b.name)
        : (b.lastTransactionDate || "").localeCompare(a.lastTransactionDate || "") || a.name.localeCompare(b.name)
    );

    const total = accounts.length;
    accounts = accounts.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return res.status(200).json({
      success: true,
      data: accounts,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /pending-bills/accounts/:accountKey — the Account Details page (the ledger view, like
// Debited's Customer Account page): the account's totals, every bill in it, and one chronological
// transaction history (bills and payments) with the running outstanding balance after each.
exports.getPendingBillAccount = async (req, res) => {
  try {
    const accountKey = normalizeAccountKey(req.params.accountKey);
    const bills = await PendingBill.findAll({
      where: { accountKey },
      include: BILL_INCLUDE,
      order: [["billDate", "ASC"], ["id", "ASC"]],
    });
    if (bills.length === 0) return res.status(404).json({ success: false, message: "Pending bill account not found" });

    const payments = await PendingBillPayment.findAll({
      where: {
        [Op.or]: [{ accountKey, pendingBillId: null }, { pendingBillId: { [Op.in]: bills.map((b) => b.id) } }],
      },
      include: PAYMENT_INCLUDE,
      order: [["paymentDate", "ASC"], ["id", "ASC"]],
    });

    // The Expense each payment created (see pendingBillService.createExpenseForPayment).
    const expenses = payments.length
      ? await AccountEntry.findAll({
          where: { referenceType: "pendingBillPayment", referenceId: { [Op.in]: payments.map((p) => p.id) } },
          attributes: ["id", "referenceId", "status"],
          include: [{ model: User, as: "creator", attributes: ["id", "name"] }],
        })
      : [];
    const expenseByPaymentId = new Map(expenses.map((e) => [e.referenceId, e]));
    const billById = new Map(bills.map((b) => [b.id, b]));

    const entries = [];
    for (const bill of bills.filter(isLive)) {
      entries.push({
        id: `bill-${bill.id}`,
        type: "BILL",
        date: bill.billDate,
        amount: Number(bill.amount),
        description: bill.name + (bill.billNumber ? ` (${bill.billNumber})` : ""),
        note: bill.description || null,
        billId: bill.id,
        recordedBy: bill.creator || null,
        _order: [bill.createdAt, 0, bill.id],
      });
    }
    for (const payment of payments) {
      const expense = expenseByPaymentId.get(payment.id);
      entries.push({
        id: `payment-${payment.id}`,
        type: "PAYMENT",
        date: payment.paymentDate,
        amount: Number(payment.amount),
        description: payment.pendingBillId != null ? `Payment — ${billById.get(payment.pendingBillId)?.name || "bill"}` : "Payment",
        note: payment.notes || null,
        paymentId: payment.id,
        billId: payment.pendingBillId,
        paymentMethod: payment.paymentMethod,
        bankAccount: payment.bankAccount || null,
        reference: payment.transactionRef,
        paymentStatus: payment.status,
        rejectionReason: payment.rejectionReason,
        recordedBy: payment.creator || null,
        expense: expense ? { id: expense.id, status: expense.status, creator: expense.creator || null } : null,
        _order: [payment.createdAt, 1, payment.id],
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date) || new Date(a._order[0]) - new Date(b._order[0]) || a._order[1] - b._order[1] || a._order[2] - b._order[2]);

    // Running outstanding: a bill adds to it, a verified payment takes from it. A payment still
    // awaiting verification (or rejected) — only possible on the old submit-then-verify flow —
    // doesn't move the balance.
    let balance = 0;
    const transactions = entries.map(({ _order, ...entry }) => {
      const affectsBalance = entry.type === "BILL" || entry.paymentStatus === "Verified";
      if (affectsBalance) balance = round2(balance + (entry.type === "BILL" ? entry.amount : -entry.amount));
      return { ...entry, affectsBalance, balance };
    });

    return res.status(200).json({
      success: true,
      data: {
        account: { ...summarizeAccount(accountKey, bills), lastTransactionDate: transactions.length ? transactions[transactions.length - 1].date : null },
        bills: bills.map(serializePendingBill),
        transactions,
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /pending-bills/:id
exports.getPendingBillById = async (req, res) => {
  try {
    const bill = await PendingBill.findByPk(req.params.id, {
      include: [
        ...BILL_INCLUDE,
        { model: PendingBillPayment, as: "payments", include: PAYMENT_INCLUDE, separate: true, order: [["createdAt", "ASC"]] },
      ],
    });
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });
    return res.status(200).json({ success: true, data: serializePendingBill(bill) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validatePendingBillPayload = (body, { requireDealer = false } = {}) => {
  const { name, dealerName, amount, billDate } = body || {};
  if (requireDealer && (!dealerName || !String(dealerName).trim())) return "Seller / Dealer / Company name is required";
  if (!name || !String(name).trim()) return "Name is required";
  if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return "A valid amount greater than 0 is required";
  }
  if (!billDate) return "Date is required";
  return null;
};

// Validates a payment request body (shared by the per-bill and the account-level payment routes).
const parsePaymentBody = (body) => {
  const { amount, paymentMethod, paymentDate, transactionRef, bankAccountId, notes } = body || {};

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) return { error: "A valid amount greater than 0 is required" };
  if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: `paymentMethod must be one of ${VALID_PAYMENT_METHODS.join(", ")}` };
  }
  if (!paymentDate) return { error: "paymentDate is required" };
  if (needsBankAccount(paymentMethod) && !bankAccountId) return { error: "Select a bank account for this payment method" };

  return {
    values: {
      amount: round2(parsedAmount),
      paymentMethod,
      paymentDate,
      transactionRef: transactionRef || null,
      bankAccountId: needsBankAccount(paymentMethod) ? bankAccountId || null : null,
      notes: notes || null,
    },
  };
};

// Locks every bill of the account this bill belongs to (always in the same order — see
// pendingBillService.loadAccountBills) before anything else is touched, so concurrent requests on
// one account serialize instead of deadlocking. Returns the requested bill from that locked set.
const lockBillWithAccount = async (billId, transaction) => {
  const existing = await PendingBill.findByPk(billId, { transaction });
  if (!existing) throw httpError(404, "Pending bill not found");
  const bills = await pendingBillService.loadAccountBills(existing.accountKey || accountKeyFor(existing), { transaction, lock: true });
  return { bill: bills.find((b) => b.id === billId) || existing, bills };
};

const notifyPaymentRecorded = (req, { payment, accountName, billId }) =>
  notify([
    {
      recipientModule: "admin",
      type: "PENDING_BILL_PAYMENT_SUBMITTED",
      title: "Pending Bill Payment Recorded",
      message: `${req.user.name || "A user"} recorded a ${formatRupees(payment.amount)} payment for ${accountName}. The linked expense is awaiting your approval.`,
      referenceType: "pendingBill",
      referenceId: billId,
      event: "pending_bill_payment_submitted",
      payload: { pendingBillId: billId, paymentId: payment.id },
    },
  ]);

// POST /pending-bills — any authenticated user with canCreate on /account/pending-bill. Adds a
// bill to its Seller/Dealer/Company's account (creating the account implicitly the first time that
// seller appears), always PENDING. Nothing counts toward Total Out at this point — each payment
// made against the account creates its own Expense (see createAccountPayment). Manual creation is
// always billType "GENERAL"; nothing else (restock, new product) creates Pending Bills any more.
exports.createPendingBill = async (req, res) => {
  try {
    const validationError = validatePendingBillPayload(req.body, { requireDealer: true });
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const { name, dealerName, amount, billDate, description, billNumber } = req.body;
    const parsedAmount = parseFloat(amount);

    const bill = await PendingBill.create({
      billType: "GENERAL",
      name: name.trim(),
      dealerName: String(dealerName).trim(),
      amount: parsedAmount,
      billDate,
      description: description || null,
      billNumber: billNumber && String(billNumber).trim() ? String(billNumber).trim() : null,
      paidAmount: 0,
      remainingAmount: parsedAmount,
      status: "PENDING",
      createdBy: req.user.id,
    });

    await notify([
      {
        recipientModule: "admin",
        type: "PENDING_BILL_PENDING_APPROVAL",
        title: "New Pending Bill Added",
        message: `${req.user.name || "A user"} added a ${formatRupees(bill.amount)} bill (${bill.name}) for ${bill.dealerName}.`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_created",
        payload: { pendingBillId: bill.id },
      },
    ]);

    return res.status(201).json({ success: true, message: "Pending bill created successfully", data: serializePendingBill(bill) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /pending-bills/:id — edits name/dealer/amount/date/description/billNumber only, never
// status/paidAmount/remainingAmount directly (those stay derived from payments). Editing the
// seller moves the bill to that seller's account; both accounts are recomputed, and Total Out is
// re-summed afterward for any day a legacy payoff entry was affected.
exports.updatePendingBill = async (req, res) => {
  try {
    const validationError = validatePendingBillPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const bill = await PendingBill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });

    const { name, dealerName, amount, billDate, description, billNumber } = req.body;
    const parsedAmount = parseFloat(amount);

    if (parsedAmount < Number(bill.paidAmount)) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot be less than what's already been paid (₹${bill.paidAmount})`,
      });
    }

    const oldDate = bill.billDate;
    const oldKey = bill.accountKey || accountKeyFor(bill);

    bill.name = name.trim();
    bill.dealerName = dealerName && String(dealerName).trim() ? dealerName.trim() : null;
    bill.amount = parsedAmount;
    bill.billDate = billDate;
    bill.description = description || null;
    if (billNumber !== undefined) bill.billNumber = billNumber ? String(billNumber).trim() : null;

    const newKey = accountKeyFor(bill);
    const datesToRecalc = new Set();

    await sequelize.transaction(async (transaction) => {
      // Lock the account(s) involved before writing, always in the same order.
      for (const key of [...new Set([oldKey, newKey])].sort()) {
        await pendingBillService.loadAccountBills(key, { transaction, lock: true });
      }
      await bill.save({ transaction });

      if (bill.status === "APPROVED") {
        // A legacy payoff AccountEntry mirrors name/date too.
        const entry = await AccountEntry.findOne({
          where: { referenceType: "pendingBill", referenceId: bill.id, category: pendingBillService.LEGACY_ENTRY_CATEGORY },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (entry) {
          entry.description = bill.name;
          entry.entryDate = bill.billDate;
          await entry.save({ transaction });
          datesToRecalc.add(bill.billDate);
          datesToRecalc.add(oldDate);
        }
      }

      for (const key of [...new Set([oldKey, newKey])].sort()) {
        const result = await pendingBillService.recalculateAccount(key, { transaction, actingUserId: req.user.id });
        result.datesToRecalc.forEach((d) => datesToRecalc.add(d));
      }
    });

    for (const date of datesToRecalc) await recalculateDay(date);

    const refreshed = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({ success: true, message: "Pending bill updated successfully", data: serializePendingBill(refreshed) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /pending-bills/:id — Admin only, enforced inline (not via canDelete). Removes the bill,
// its own (per-bill) payment history and the Expenses those payments created, plus any legacy
// payoff entry, so Total Out reverses correctly. Refused (409) if what's been paid into the
// account would then exceed what's left billed — delete or reduce those payments first.
exports.deletePendingBill = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can delete a pending bill" });
    }

    const found = await PendingBill.findByPk(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: "Pending bill not found" });

    const datesToRecalc = new Set();

    await sequelize.transaction(async (transaction) => {
      const { bill } = await lockBillWithAccount(found.id, transaction);

      const legacyWhere = { referenceType: "pendingBill", referenceId: bill.id };
      const legacyEntries = await AccountEntry.findAll({ where: legacyWhere, transaction });
      legacyEntries.filter((e) => e.status === "APPROVED").forEach((e) => datesToRecalc.add(e.entryDate));
      await AccountEntry.destroy({ where: legacyWhere, transaction });

      const payments = await PendingBillPayment.findAll({ where: { pendingBillId: bill.id }, attributes: ["id"], transaction });
      (await pendingBillService.removeExpensesForPayments(payments.map((p) => p.id), { transaction })).forEach((d) => datesToRecalc.add(d));
      await PendingBillPayment.destroy({ where: { pendingBillId: bill.id }, transaction });
      await bill.destroy({ transaction });

      await pendingBillService.recalculateAccount(bill.accountKey || accountKeyFor(bill), { transaction });
    });

    for (const date of datesToRecalc) await recalculateDay(date);

    return res.status(200).json({ success: true, message: "Pending bill deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:id/cancel — Admin only. Blocked once any payment has already been
// applied (a bill that's already (partially) paid should be handled deliberately, not cancelled
// out from under its payment history).
exports.cancelPendingBill = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can cancel a pending bill" });
    }

    const found = await PendingBill.findByPk(req.params.id);
    if (!found) return res.status(404).json({ success: false, message: "Pending bill not found" });

    if (Number(found.paidAmount) > 0) {
      return res.status(400).json({ success: false, message: "Cannot cancel a bill that already has payments" });
    }
    if (found.status === "CANCELLED") {
      return res.status(200).json({ success: true, message: "Pending bill is already cancelled", data: serializePendingBill(found) });
    }

    await sequelize.transaction(async (transaction) => {
      const { bill } = await lockBillWithAccount(found.id, transaction);
      bill.status = "CANCELLED";
      await bill.save({ transaction });
      // A cancelled bill no longer counts toward the account, so payments pooled on the account
      // are re-applied to what's still billed (and refused if that leaves them over-applied).
      await pendingBillService.recalculateAccount(bill.accountKey || accountKeyFor(bill), { transaction });
    });

    const billWithIncludes = await PendingBill.findByPk(found.id, { include: BILL_INCLUDE });
    return res.status(200).json({ success: true, message: "Pending bill cancelled", data: serializePendingBill(billWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/accounts/:accountKey/payments — "Pay" on the Account Details page: a payment
// of any amount up to the account's current outstanding balance (partial payments and multiple
// payments both fine), applied to the account's bills oldest-first. It takes effect immediately —
// the account's outstanding drops right away — and stays in the account's history as its own
// record; the original bills are never overwritten. In the same transaction it creates the linked
// Expense, created by the logged-in user who made the payment, PENDING Admin approval (existing
// Expense workflow) before it counts toward Total Out.
exports.createAccountPayment = async (req, res) => {
  try {
    const accountKey = normalizeAccountKey(req.params.accountKey);
    if (!accountKey) return res.status(400).json({ success: false, message: "Account is required" });

    const { values, error } = parsePaymentBody(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const result = await sequelize.transaction(async (transaction) => {
      const bills = await pendingBillService.loadAccountBills(accountKey, { transaction, lock: true });
      if (bills.length === 0) throw httpError(404, "Pending bill account not found");

      const previousOutstanding = pendingBillService.outstandingOf(bills);
      if (previousOutstanding <= EPSILON) throw httpError(400, "This account has nothing outstanding");
      if (values.amount > previousOutstanding + EPSILON) {
        throw httpError(400, `Amount exceeds the outstanding balance of ${formatRupees(previousOutstanding)}`);
      }

      const created = await PendingBillPayment.create(
        { ...values, pendingBillId: null, accountKey, status: "Verified", verifiedAt: new Date(), createdBy: req.user.id },
        { transaction }
      );

      const { bills: updatedBills } = await pendingBillService.recalculateAccount(accountKey, { transaction, actingUserId: req.user.id });
      const accountName = accountNameFor(updatedBills[0]);
      await pendingBillService.createExpenseForPayment(created, { accountName }, { transaction });

      return {
        payment: await PendingBillPayment.findByPk(created.id, { include: PAYMENT_INCLUDE, transaction }),
        accountName,
        previousOutstanding,
        outstanding: pendingBillService.outstandingOf(updatedBills),
        billId: updatedBills.find(isLive)?.id ?? updatedBills[0].id,
      };
    });

    await notifyPaymentRecorded(req, result);

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        payment: serializePayment(result.payment),
        previousOutstanding: result.previousOutstanding,
        outstanding: result.outstanding,
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:id/payments — a payment against one specific bill (used when a payment is
// recorded while adding the bill, or paying a single bill directly): the full amount or a partial
// one, any number of times, up to what that bill still owes. Same immediate effect, history record
// and linked Expense (created by the logged-in user) as an account-level payment.
exports.createPayment = async (req, res) => {
  try {
    const { values, error } = parsePaymentBody(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const { bill, payment } = await sequelize.transaction(async (transaction) => {
      const { bill: row } = await lockBillWithAccount(req.params.id, transaction);
      if (["CANCELLED", "APPROVED", "REJECTED"].includes(row.status)) {
        throw httpError(400, `Cannot record a payment against a bill with status ${row.status}`);
      }
      if (values.amount > Number(row.remainingAmount) + EPSILON) {
        throw httpError(400, `Amount exceeds the remaining balance of ₹${row.remainingAmount}`);
      }

      const created = await PendingBillPayment.create(
        { ...values, pendingBillId: row.id, status: "Verified", verifiedAt: new Date(), createdBy: req.user.id },
        { transaction }
      );

      const { bill: updatedBill } = await pendingBillService.recalculateStatus(row.id, { transaction, actingUserId: req.user.id });
      await pendingBillService.createExpenseForPayment(created, { accountName: accountNameFor(updatedBill) }, { transaction });

      return { bill: updatedBill, payment: await PendingBillPayment.findByPk(created.id, { include: PAYMENT_INCLUDE, transaction }) };
    });

    await notifyPaymentRecorded(req, { payment, accountName: accountNameFor(bill), billId: bill.id });

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /pending-bills/:billId/payments/:paymentId — retracting a not-yet-verified submission
// (own submission, or Admin any time before verification). Only possible for a payment recorded
// under the old submit-then-verify flow; every payment now takes effect immediately and, like
// verified/rejected ones, is permanent history.
exports.deletePayment = async (req, res) => {
  try {
    const payment = await PendingBillPayment.findOne({
      where: { id: req.params.paymentId, pendingBillId: req.params.billId },
    });
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    if (payment.status !== "Pending Verification") {
      return res.status(400).json({ success: false, message: "Only a payment still pending verification can be deleted" });
    }
    if (req.user.roleName !== "Admin" && payment.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only delete your own unverified payment" });
    }

    await sequelize.transaction(async (transaction) => {
      await lockBillWithAccount(req.params.billId, transaction);
      await payment.destroy({ transaction });
      await pendingBillService.recalculateStatus(req.params.billId, { transaction });
    });

    const billWithIncludes = await PendingBill.findByPk(req.params.billId, { include: BILL_INCLUDE });
    return res.status(200).json({ success: true, message: "Payment deleted", data: serializePendingBill(billWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:billId/payments/:paymentId/verify — Admin only, for a payment recorded
// under the old submit-then-verify flow. Locks the account's bills first, then the payment,
// recomputes inside the same transaction, and creates the payment's linked Expense — created by
// whoever recorded the payment, not by the verifying Admin.
exports.verifyPayment = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can verify a payment" });
    }

    const { bill, payment, alreadyActioned, previousStatus, becameApproved } = await sequelize.transaction(async (transaction) => {
      const { bill: billRow } = await lockBillWithAccount(req.params.billId, transaction);
      const paymentRow = await PendingBillPayment.findOne({
        where: { id: req.params.paymentId, pendingBillId: billRow.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!paymentRow) throw httpError(404, "Payment not found");
      if (paymentRow.status !== "Pending Verification") {
        return { bill: billRow, payment: paymentRow, alreadyActioned: true };
      }

      const prevStatus = billRow.status;
      paymentRow.status = "Verified";
      paymentRow.verifiedBy = req.user.id;
      paymentRow.verifiedAt = new Date();
      await paymentRow.save({ transaction });

      const { bill: updatedBill, becameApproved: justApproved } = await pendingBillService.recalculateStatus(billRow.id, {
        transaction,
        actingUserId: req.user.id,
      });
      await pendingBillService.createExpenseForPayment(
        paymentRow,
        { accountName: accountNameFor(updatedBill), fallbackUserId: req.user.id },
        { transaction }
      );
      return { bill: updatedBill, payment: paymentRow, alreadyActioned: false, previousStatus: prevStatus, becameApproved: justApproved };
    });

    if (alreadyActioned) {
      const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
      return res.status(200).json({
        success: true,
        message: `Payment is already ${payment.status}`,
        data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
      });
    }

    const events = [
      {
        recipientModule: "account",
        recipientUserId: bill.createdBy,
        type: "PENDING_BILL_PAYMENT_VERIFIED",
        title: "Payment Verified",
        message: `Your ${formatRupees(payment.amount)} payment for ${bill.name} was verified.`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_payment_verified",
        payload: { pendingBillId: bill.id, paymentId: payment.id },
      },
    ];

    if (bill.status !== previousStatus) {
      if (becameApproved) {
        events.push({
          recipientModule: "account",
          recipientUserId: bill.createdBy,
          type: "PENDING_BILL_APPROVED",
          title: "Pending Bill Fully Paid",
          message: `Your bill (${bill.name}) of ${formatRupees(bill.amount)} is now fully paid.`,
          referenceType: "pendingBill",
          referenceId: bill.id,
          event: "pending_bill_approved",
          payload: { pendingBillId: bill.id },
        });
      } else if (bill.status === "PARTIALLY_PAID") {
        events.push({
          recipientModule: "admin",
          type: "PENDING_BILL_PARTIALLY_PAID",
          title: "Pending Bill Partially Paid",
          message: `Bill "${bill.name}" is now Partially Paid. Remaining: ${formatRupees(bill.remainingAmount)}.`,
          referenceType: "pendingBill",
          referenceId: bill.id,
          event: "pending_bill_partially_paid",
          payload: { pendingBillId: bill.id },
        });
      }
    }

    await notify(events);

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:billId/payments/:paymentId/reject — Admin only, for a payment recorded
// under the old submit-then-verify flow. rejectionReason required.
exports.rejectPayment = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can reject a payment" });
    }

    const { rejectionReason } = req.body || {};
    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ success: false, message: "rejectionReason is required" });
    }

    const { bill, payment, alreadyActioned } = await sequelize.transaction(async (transaction) => {
      const { bill: billRow } = await lockBillWithAccount(req.params.billId, transaction);
      const paymentRow = await PendingBillPayment.findOne({
        where: { id: req.params.paymentId, pendingBillId: billRow.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!paymentRow) throw httpError(404, "Payment not found");
      if (paymentRow.status !== "Pending Verification") {
        return { bill: billRow, payment: paymentRow, alreadyActioned: true };
      }

      paymentRow.status = "Rejected";
      paymentRow.verifiedBy = req.user.id;
      paymentRow.verifiedAt = new Date();
      paymentRow.rejectionReason = String(rejectionReason).trim();
      await paymentRow.save({ transaction });

      const { bill: updatedBill } = await pendingBillService.recalculateStatus(billRow.id, { transaction });
      return { bill: updatedBill, payment: paymentRow, alreadyActioned: false };
    });

    if (alreadyActioned) {
      const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
      return res.status(200).json({
        success: true,
        message: `Payment is already ${payment.status}`,
        data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
      });
    }

    await notify([
      {
        recipientModule: "account",
        recipientUserId: bill.createdBy,
        type: "PENDING_BILL_PAYMENT_REJECTED",
        title: "Payment Rejected",
        message: `Your ${formatRupees(payment.amount)} payment for ${bill.name} was rejected: ${payment.rejectionReason}`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_payment_rejected",
        payload: { pendingBillId: bill.id, paymentId: payment.id },
      },
    ]);

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({
      success: true,
      message: "Payment rejected",
      data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};
