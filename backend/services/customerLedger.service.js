const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { CustomerLedgerEntry, Customer, Sale, User, BankAccount, LedgerEntryBankAccount } = require("../models");

const todayDateOnly = () => new Date().toISOString().slice(0, 10);

// A ledger payment/adjustment made via BankTransfer or UPI can be split across multiple bank
// accounts — each {bankAccountId, amount} row must name a bank account and a positive amount,
// and (unlike a Sale's bank split, which may fall short of the collected amount) the rows must
// add up to EXACTLY the entry's amount, since the whole entry is a bank-routed payment. The same
// bank account may appear in more than one row (rows are never merged). Shared by recordPayment,
// recordAdjustment, and updateEntry below.
const normalizeBankPayments = (bankPayments, targetAmount) => {
  const rows = (Array.isArray(bankPayments) ? bankPayments : [])
    .filter((row) => row && row.bankAccountId)
    .map((row) => ({ bankAccountId: Number(row.bankAccountId), amount: parseFloat(row.amount) || 0 }));

  if (rows.length === 0) {
    const err = new Error("Select at least one bank account for this payment method");
    err.statusCode = 400;
    throw err;
  }

  for (const row of rows) {
    if (!row.amount || row.amount <= 0) {
      const err = new Error("Each bank account row must have an amount greater than 0");
      err.statusCode = 400;
      throw err;
    }
  }

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (Math.abs(total - targetAmount) > 0.01) {
    const err = new Error("Bank account amounts must add up to the total payment amount");
    err.statusCode = 400;
    throw err;
  }

  return rows;
};

const needsBankSplit = (paymentMethod) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";

// Replaces every LedgerEntryBankAccount row for an entry with a fresh set (or clears them when
// the resolved payment method no longer needs a bank split) — used by both create and edit paths
// so the split rows and the legacy bankAccountId column can never drift apart.
const syncBankPayments = async (entry, paymentMethod, bankPayments, targetAmount, { transaction } = {}) => {
  await LedgerEntryBankAccount.destroy({ where: { ledgerEntryId: entry.id }, transaction });

  if (!needsBankSplit(paymentMethod)) {
    entry.bankAccountId = null;
    await entry.save({ transaction });
    return;
  }

  const rows = normalizeBankPayments(bankPayments, targetAmount);
  await LedgerEntryBankAccount.bulkCreate(
    rows.map((row) => ({ ledgerEntryId: entry.id, bankAccountId: row.bankAccountId, amount: row.amount })),
    { transaction }
  );

  entry.bankAccountId = rows[0].bankAccountId;
  await entry.save({ transaction });
};

// Single source of truth for "advance vs pending vs settled" — used by the API responses,
// the Sells list, and the PDF statement so the label/status can never drift between screens.
const getBalanceStatus = (balance) => {
  const amount = parseFloat(balance) || 0;
  if (amount > 0) return { amount, status: "ADVANCE", label: "Advance" };
  if (amount < 0) return { amount, status: "PENDING", label: "Pending" };
  return { amount: 0, status: "SETTLED", label: "Settled" };
};

// Balance = SUM(amount) over every remaining row for the customer. A deleted transaction is a
// hard delete (see deleteEntry below), so it's simply gone from this sum — no voided flag to
// filter on.
const getCustomerBalance = async (customerId, { transaction } = {}) => {
  const result = await CustomerLedgerEntry.findOne({
    where: { customerId },
    attributes: [[sequelize.fn("SUM", sequelize.col("amount")), "total"]],
    raw: true,
    transaction,
  });
  return getBalanceStatus(result && result.total);
};

// Batched version for list screens (the Sells table) — one grouped query instead of N+1.
// Returns a Map<customerId, {amount, status, label}>; customers with no ledger rows are omitted
// (callers should default to a zero/settled balance for those).
const getCustomerBalances = async (customerIds) => {
  const ids = [...new Set((customerIds || []).filter((id) => id != null))];
  if (ids.length === 0) return new Map();

  const rows = await CustomerLedgerEntry.findAll({
    where: { customerId: { [Op.in]: ids } },
    attributes: ["customerId", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
    group: ["customerId"],
    raw: true,
  });

  const map = new Map();
  for (const row of rows) {
    map.set(row.customerId, getBalanceStatus(row.total));
  }
  return map;
};

const recordSaleDebit = async ({ customerId, saleId, amount, transactionDate, userId }, { transaction } = {}) => {
  const parsedAmount = parseFloat(amount) || 0;
  if (parsedAmount <= 0) return null;

  // Defense-in-depth against a duplicate debit for the same sale (e.g. a retried request) —
  // the app-level convention is exactly one SALE entry per sale, so if one already exists just
  // return it instead of creating a second one.
  if (saleId) {
    const existing = await CustomerLedgerEntry.findOne({ where: { saleId, type: "SALE" }, transaction });
    if (existing) return existing;
  }

  return CustomerLedgerEntry.create(
    {
      customerId,
      saleId: saleId || null,
      type: "SALE",
      amount: -parsedAmount,
      transactionDate: transactionDate || todayDateOnly(),
      createdBy: userId || null,
    },
    { transaction }
  );
};

// Adjusts the existing SALE entry for a sale to a new amount (used when a sale's sellingAmount
// is edited after creation) instead of leaving it stale — see sells.controller.js#updateSale.
// Falls back to creating one if none exists yet (e.g. a customer was only just linked on this
// edit), and removes it outright if the new amount is zero/negative.
const updateSaleDebit = async (saleId, customerId, newSellingAmount, { transaction, userId } = {}) => {
  const parsedAmount = parseFloat(newSellingAmount) || 0;
  const entry = await CustomerLedgerEntry.findOne({ where: { saleId, type: "SALE" }, transaction, lock: !!transaction });

  if (!entry) {
    if (!customerId || parsedAmount <= 0) return null;
    return recordSaleDebit({ customerId, saleId, amount: parsedAmount, userId }, { transaction });
  }

  if (!customerId || parsedAmount <= 0) {
    await entry.destroy({ transaction });
    return null;
  }

  entry.amount = -parsedAmount;
  if (entry.customerId !== customerId) entry.customerId = customerId;
  await entry.save({ transaction });
  return entry;
};

// Records a payment/credit. No upper-bound validation against the current pending amount —
// overpayment is allowed by design and simply becomes customer advance (see spec §13). A
// BankTransfer/UPI payment must name at least one bank account (bankPayments), and — since the
// whole entry is a bank-routed payment — its rows must add up to exactly `amount` (see
// normalizeBankPayments above). bankAccountId is kept in sync as the first row's bank account for
// any reader that still uses the legacy single-account column.
const recordPayment = async (
  { customerId, saleId, amount, paymentMethod, bankPayments, reference, note, transactionDate, userId },
  { transaction } = {}
) => {
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    const err = new Error("amount must be a positive number");
    err.statusCode = 400;
    throw err;
  }

  const bankPaymentRows = needsBankSplit(paymentMethod) ? normalizeBankPayments(bankPayments, parsedAmount) : [];

  const entry = await CustomerLedgerEntry.create(
    {
      customerId,
      saleId: saleId || null,
      type: "PAYMENT",
      amount: parsedAmount,
      paymentMethod: paymentMethod || null,
      bankAccountId: bankPaymentRows[0]?.bankAccountId || null,
      reference: reference || null,
      note: note || null,
      transactionDate: transactionDate || todayDateOnly(),
      createdBy: userId || null,
    },
    { transaction }
  );

  if (bankPaymentRows.length > 0) {
    await LedgerEntryBankAccount.bulkCreate(
      bankPaymentRows.map((row) => ({ ledgerEntryId: entry.id, bankAccountId: row.bankAccountId, amount: row.amount })),
      { transaction }
    );
  }

  return entry;
};

// Signed correction, used where an existing flow can pass a negative "payment" (e.g. the
// per-sale recordPayment endpoint accepts a negative amount to correct an over-collection).
// Kept distinct from recordPayment (which is credit-only, matching the Collect Amount UI).
const recordAdjustment = async (
  { customerId, saleId, amount, paymentMethod, bankAccountId, reference, note, transactionDate, userId },
  { transaction } = {}
) => {
  const parsedAmount = parseFloat(amount) || 0;
  if (parsedAmount === 0) return null;

  return CustomerLedgerEntry.create(
    {
      customerId,
      saleId: saleId || null,
      type: "ADJUSTMENT",
      amount: parsedAmount,
      paymentMethod: paymentMethod || null,
      bankAccountId: paymentMethod === "BankTransfer" ? bankAccountId || null : null,
      reference: reference || null,
      note: note || null,
      transactionDate: transactionDate || todayDateOnly(),
      createdBy: userId || null,
    },
    { transaction }
  );
};

// Account → Debited "Add Debited Record" — a debit that didn't come from a Sale (e.g. a
// standalone credit given outside the Sales flow), added by hand for a chosen customer. Always
// negative (it's a debit): the caller passes the amount the customer owes as a positive number,
// same convention as the Add form. Kept as its own MANUAL_DEBIT type rather than reusing
// ADJUSTMENT (which order.service.js already uses internally for collected-amount corrections)
// so getDebtors below can unambiguously find "the" manually-added record for a customer without
// ever picking up an unrelated system-generated correction entry.
const recordManualDebit = async ({ customerId, amount, transactionDate, reference, note, userId }, { transaction } = {}) => {
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    const err = new Error("amount must be a positive number");
    err.statusCode = 400;
    throw err;
  }

  const resolvedDate = transactionDate || todayDateOnly();

  // Same double-submission defense as recordPayment above.
  const recentDuplicate = await CustomerLedgerEntry.findOne({
    where: {
      customerId,
      type: "MANUAL_DEBIT",
      amount: -parsedAmount,
      reference: reference || null,
      note: note || null,
      transactionDate: resolvedDate,
      createdAt: { [Op.gte]: new Date(Date.now() - 10000) },
    },
    order: [["createdAt", "DESC"]],
    transaction,
  });
  if (recentDuplicate) return recentDuplicate;

  return CustomerLedgerEntry.create(
    {
      customerId,
      saleId: null,
      type: "MANUAL_DEBIT",
      amount: -parsedAmount,
      reference: reference || null,
      note: note || null,
      transactionDate: resolvedDate,
      createdBy: userId || null,
    },
    { transaction }
  );
};

const entryIncludes = [
  { model: Sale, as: "sale", attributes: ["id", "invoiceNumber"] },
  { model: User, as: "creator", attributes: ["id", "name"] },
  { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
  {
    model: LedgerEntryBankAccount,
    as: "bankPayments",
    include: [{ model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] }],
  },
];

const getCustomerLedger = async (customerId) => {
  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    const err = new Error("Customer not found");
    err.statusCode = 404;
    throw err;
  }

  const entries = await CustomerLedgerEntry.findAll({
    where: { customerId },
    include: entryIncludes,
    order: [
      ["transactionDate", "ASC"],
      ["createdAt", "ASC"],
    ],
  });

  const balance = await getCustomerBalance(customerId);

  return { customer, balance, entries };
};

// Edit an existing entry (§20). Balance is always derived live from SUM(), so no separate
// recalculation step is needed — every screen just re-reads the current sum. When bankPayments
// is provided, every existing bank-split row for this entry is replaced with the new set (see
// syncBankPayments above) — a caller that isn't touching payment method/bank details at all
// (e.g. editing a manual debit) simply omits it and the existing rows are left untouched.
const updateEntry = async (
  { entryId, amount, paymentMethod, bankPayments, reference, note, transactionDate },
  { transaction } = {}
) => {
  const entry = await CustomerLedgerEntry.findByPk(entryId, { transaction, lock: !!transaction });
  if (!entry) {
    const err = new Error("Ledger entry not found");
    err.statusCode = 404;
    throw err;
  }

  if (amount !== undefined) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      const err = new Error("amount must be a positive number");
      err.statusCode = 400;
      throw err;
    }
    // Preserve the entry's sign (SALE stays negative, PAYMENT/ADJUSTMENT stays positive) —
    // editing only changes magnitude, never the transaction's fundamental direction.
    entry.amount = entry.amount < 0 ? -parsedAmount : parsedAmount;
  }
  if (paymentMethod !== undefined) entry.paymentMethod = paymentMethod || null;
  if (reference !== undefined) entry.reference = reference || null;
  if (note !== undefined) entry.note = note || null;
  if (transactionDate !== undefined) entry.transactionDate = transactionDate;

  await entry.save({ transaction });

  if (bankPayments !== undefined) {
    await syncBankPayments(entry, entry.paymentMethod, bankPayments, Math.abs(parseFloat(entry.amount)), { transaction });
  }

  return entry;
};

// Hard delete — Admin-only, enforced by the controller. Financial correction here is by editing
// the entry (updateEntry) beforehand if needed; deleting permanently removes the row and its
// amount simply drops out of every future SUM().
const deleteEntry = async ({ entryId }, { transaction } = {}) => {
  const entry = await CustomerLedgerEntry.findByPk(entryId, { transaction, lock: !!transaction });
  if (!entry) {
    const err = new Error("Ledger entry not found");
    err.statusCode = 404;
    throw err;
  }

  const snapshot = entry.toJSON();
  await entry.destroy({ transaction });
  return snapshot;
};

// Account → Debited: one row per customer. `status` selects which bucket:
// - "PENDING" (default) — balance < 0, highest-pending first (unchanged behavior).
// - "SETTLED" — every other customer with ledger history (balance >= 0, i.e. Settled ∪ Advance)
//   — the spec's Settled/History view; folding Advance in here too since the spec's Pending/
//   Settled model doesn't have a third bucket, and "not currently owing" is the least-surprising
//   read of "Settled" for that case.
// `startDate`/`endDate` narrow WHICH customers are included (only those with a ledger entry
// dated inside the range) — the balance shown is always the true, full-history running total
// (never range-limited), matching the ledger's "balance never resets" rule.
const getDebtors = async ({ search, startDate, endDate, page, limit, status } = {}) => {
  const balanceRows = await CustomerLedgerEntry.findAll({
    attributes: [
      "customerId",
      [sequelize.fn("SUM", sequelize.col("amount")), "total"],
      [sequelize.fn("MAX", sequelize.col("transactionDate")), "lastTransactionDate"],
    ],
    group: ["customerId"],
    raw: true,
  });

  // Total purchased/owed (SALE + MANUAL_DEBIT entries, as a positive amount) — combined with the
  // authoritative `balance` below to derive totalPaid, so Total - Paid always equals the
  // outstanding balance even when ADJUSTMENT entries exist (no separate/duplicate accounting for
  // those). MANUAL_DEBIT must count here too, otherwise a customer whose balance comes only from
  // a manually-added Debited record shows Total Purchase ₹0 while still carrying a balance.
  const debitTotalRows = await CustomerLedgerEntry.findAll({
    where: { type: { [Op.in]: ["SALE", "MANUAL_DEBIT"] } },
    attributes: ["customerId", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
    group: ["customerId"],
    raw: true,
  });
  const totalPurchaseMap = new Map(debitTotalRows.map((row) => [row.customerId, Math.abs(parseFloat(row.total) || 0)]));

  const balanceMap = new Map(balanceRows.map((row) => [row.customerId, getBalanceStatus(row.total)]));
  const lastTransactionMap = new Map(balanceRows.map((row) => [row.customerId, row.lastTransactionDate]));

  const wantSettled = (status || "PENDING").toUpperCase() === "SETTLED";
  let matchedIds = wantSettled
    ? balanceRows.filter((row) => parseFloat(row.total) >= 0).map((row) => row.customerId)
    : balanceRows.filter((row) => parseFloat(row.total) < 0).map((row) => row.customerId);

  if ((startDate || endDate) && matchedIds.length > 0) {
    const dateWhere = {};
    if (startDate) dateWhere[Op.gte] = startDate;
    if (endDate) dateWhere[Op.lte] = endDate;

    const activeRows = await CustomerLedgerEntry.findAll({
      where: { customerId: { [Op.in]: matchedIds }, transactionDate: dateWhere },
      attributes: ["customerId"],
      group: ["customerId"],
      raw: true,
    });
    const activeIds = new Set(activeRows.map((row) => row.customerId));
    matchedIds = matchedIds.filter((id) => activeIds.has(id));
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;

  if (matchedIds.length === 0) {
    return { customers: [], page: pageNum, limit: limitNum, total: 0, totalPages: 1 };
  }

  const where = { id: { [Op.in]: matchedIds } };
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    where[Op.or] = [{ name: { [Op.like]: s } }, { phone: { [Op.like]: s } }];
  }

  const matches = await Customer.findAll({ where, attributes: ["id", "name", "phone", "city"] });

  const withBalance = matches.map((customer) => {
    const balance = balanceMap.get(customer.id);
    const totalPurchase = totalPurchaseMap.get(customer.id) || 0;
    const outstanding = Math.max(0, -balance.amount);
    const totalPaid = Math.max(0, totalPurchase - outstanding);
    return {
      ...customer.toJSON(),
      balance,
      totalPurchase,
      totalPaid,
      lastTransactionDate: lastTransactionMap.get(customer.id) || null,
    };
  });

  // Pending: highest debt first (balance is negative, so ascending puts the biggest debt on
  // top). Settled/History: most recent activity first.
  withBalance.sort((a, b) =>
    wantSettled
      ? String(b.lastTransactionDate || "").localeCompare(String(a.lastTransactionDate || ""))
      : a.balance.amount - b.balance.amount
  );

  const offset = (pageNum - 1) * limitNum;
  const pageOfCustomers = withBalance.slice(offset, offset + limitNum);

  // Attach each page row's own manually-added debit (if any), so the Debited main table knows
  // whether to show its Edit action and what to pre-fill it with — only queried for the current
  // page, not every matched debtor. A customer could in theory pick up more than one MANUAL_DEBIT
  // row over time; the most recent one is "the" editable record (see recordManualDebit above).
  const pageIds = pageOfCustomers.map((c) => c.id);
  const manualDebitRows = pageIds.length
    ? await CustomerLedgerEntry.findAll({
        where: { customerId: { [Op.in]: pageIds }, type: "MANUAL_DEBIT" },
        order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
        raw: true,
      })
    : [];
  const manualDebitMap = new Map();
  for (const row of manualDebitRows) {
    if (!manualDebitMap.has(row.customerId)) manualDebitMap.set(row.customerId, row);
  }

  const customers = pageOfCustomers.map((c) => {
    const manualDebitRow = manualDebitMap.get(c.id);
    return {
      ...c,
      manualDebitEntry: manualDebitRow
        ? {
            id: manualDebitRow.id,
            amount: Math.abs(parseFloat(manualDebitRow.amount) || 0),
            transactionDate: manualDebitRow.transactionDate,
            reference: manualDebitRow.reference,
            note: manualDebitRow.note,
          }
        : null,
    };
  });

  return {
    customers,
    page: pageNum,
    limit: limitNum,
    total: withBalance.length,
    totalPages: Math.max(1, Math.ceil(withBalance.length / limitNum)),
  };
};

// Total Receivable = sum of every customer's outstanding (negative) balance, i.e. the same
// "Pending" bucket getDebtors lists, collapsed to one number for the Accounts dashboard KPI.
const getReceivableTotal = async () => {
  const balanceRows = await CustomerLedgerEntry.findAll({
    attributes: ["customerId", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
    group: ["customerId"],
    raw: true,
  });

  let totalReceivable = 0;
  let debtorCount = 0;
  for (const row of balanceRows) {
    const total = parseFloat(row.total) || 0;
    if (total < 0) {
      totalReceivable += -total;
      debtorCount += 1;
    }
  }

  return { totalReceivable, debtorCount };
};

// Removes the (single) SALE entry linked to a sale, if any — used when a sale is cancelled so
// its debit no longer counts against the customer's balance. A no-op if the sale never had a
// customer (no ledger entries were ever created for it).
const removeSaleDebit = async (saleId, { transaction } = {}) => {
  const entry = await CustomerLedgerEntry.findOne({
    where: { saleId, type: "SALE" },
    transaction,
    lock: !!transaction,
  });
  if (!entry) return null;

  await entry.destroy({ transaction });
  return entry;
};

module.exports = {
  getBalanceStatus,
  getCustomerBalance,
  getCustomerBalances,
  recordSaleDebit,
  updateSaleDebit,
  recordPayment,
  recordAdjustment,
  recordManualDebit,
  getCustomerLedger,
  updateEntry,
  deleteEntry,
  removeSaleDebit,
  getDebtors,
  getReceivableTotal,
};
