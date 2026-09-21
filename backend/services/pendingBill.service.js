const { Op } = require("sequelize");
const { PendingBill, PendingBillPayment, AccountEntry } = require("../models");
const { accountKeyFor } = require("../helper/pendingBillAccount");

// Legacy category for the AccountEntry a bill used to get once it was fully paid off, before every
// payment created its own Expense. Hidden from the Expense module — see expense.controller.js.
const LEGACY_ENTRY_CATEGORY = "Pending Bill";
const PAYMENT_REFERENCE_TYPE = "pendingBillPayment";
const EPSILON = 0.001;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (rows, pick) => rows.reduce((total, row) => total + Number(pick(row)), 0);
const isLive = (bill) => !["CANCELLED", "REJECTED"].includes(bill.status);

const conflict = (message) => {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
};

// Every bill of a Pending Bill account, oldest first (the order account-level payments are
// applied in). `lock` row-locks them, so two concurrent payments/edits on one account serialize.
const loadAccountBills = (accountKey, { transaction, lock } = {}) =>
  PendingBill.findAll({
    where: { accountKey },
    order: [["billDate", "ASC"], ["id", "ASC"]],
    transaction,
    lock: lock ? transaction.LOCK.UPDATE : undefined,
  });

// Every payment that counts toward an account: its account-level payments, plus any payment made
// against one specific bill of it.
const loadAccountPayments = (accountKey, billIds, { transaction } = {}) =>
  PendingBillPayment.findAll({
    where: {
      [Op.or]: [{ accountKey, pendingBillId: null }, ...(billIds.length ? [{ pendingBillId: { [Op.in]: billIds } }] : [])],
    },
    order: [["paymentDate", "ASC"], ["id", "ASC"]],
    transaction,
  });

// The amount still owed on an account, from the (locked) bills' stored remainingAmount.
const outstandingOf = (bills) => round2(sum(bills.filter(isLive), (b) => b.remainingAmount));

// Single source of truth for every bill's paidAmount/remainingAmount/status in one Pending Bill
// account — always recomputed from the current payment rows, inside the same transaction as
// whatever mutation triggered it (recording/verifying/rejecting/deleting a payment, or
// adding/editing/deleting/cancelling a bill). Never trust a client-sent paid/remaining value.
//
//  - A payment made against one specific bill (pendingBillId set) counts fully toward that bill.
//  - Account-level payments (pendingBillId null) are pooled and applied to the account's bills
//    oldest-first, each up to what it still owes after its own direct payments.
//  - Only "Verified" payments count; a payment's history row is never modified by any of this.
//
// Throws 409 if verified payments would exceed what's billed (a bill's own direct payments beyond
// its amount, or the account pool beyond the total still owed) — the authoritative guard against
// concurrent over-payment; the caller's transaction rolls back.
//
// Returns the bills plus what changed. When a bill stops being fully paid ("APPROVED") its legacy
// payoff AccountEntry, if it had one, is removed and that bill's date is returned in
// `datesToRecalc` so the caller can re-sum Total Out for it after the transaction commits.
// `actingUserId` is recorded as approvedBy when a bill becomes fully paid.
const recalculateAccount = async (accountKey, { transaction, actingUserId } = {}) => {
  const bills = await loadAccountBills(accountKey, { transaction, lock: true });
  const payments = await loadAccountPayments(accountKey, bills.map((b) => b.id), { transaction });
  const verified = (p) => p.status === "Verified";

  let pool = round2(sum(payments.filter((p) => p.pendingBillId == null && verified(p)), (p) => p.amount));
  const transitions = {};
  const datesToRecalc = [];

  for (const bill of bills) {
    const direct = payments.filter((p) => p.pendingBillId === bill.id);
    const directPaid = round2(sum(direct.filter(verified), (p) => p.amount));
    const total = Number(bill.amount);

    if (directPaid > total + EPSILON) {
      throw conflict("Verified payments cannot exceed the bill's total amount");
    }

    let allocated = 0;
    if (isLive(bill)) {
      allocated = Math.min(pool, Math.max(0, total - directPaid));
      pool = round2(pool - allocated);
    }

    const paid = round2(directPaid + allocated);
    bill.paidAmount = paid;
    bill.remainingAmount = round2(total - paid);

    const wasApproved = bill.status === "APPROVED";
    if (isLive(bill)) {
      if (paid >= total) {
        bill.status = "APPROVED";
      } else if (direct.some((p) => p.status === "Pending Verification")) {
        bill.status = "PENDING_VERIFICATION";
      } else if (paid > 0) {
        bill.status = "PARTIALLY_PAID";
      } else {
        bill.status = "PENDING";
      }
    }

    const becameApproved = !wasApproved && bill.status === "APPROVED";
    const noLongerApproved = wasApproved && bill.status !== "APPROVED";
    if (becameApproved) {
      bill.approvedBy = actingUserId ?? null;
      bill.approvedAt = new Date();
    }

    await bill.save({ transaction });

    if (noLongerApproved) {
      const removed = await AccountEntry.destroy({
        where: { referenceType: "pendingBill", referenceId: bill.id, category: LEGACY_ENTRY_CATEGORY },
        transaction,
      });
      if (removed) datesToRecalc.push(bill.billDate);
    }

    transitions[bill.id] = { becameApproved, noLongerApproved };
  }

  if (pool > EPSILON) {
    throw conflict("Payments on this account cannot exceed the total amount billed");
  }

  return { bills, transitions, datesToRecalc };
};

// Recomputes the account a single bill belongs to (see recalculateAccount) and returns that bill.
const recalculateStatus = async (pendingBillId, { transaction, actingUserId } = {}) => {
  const existing = await PendingBill.findByPk(pendingBillId, { transaction });
  if (!existing) {
    const err = new Error("Pending bill not found");
    err.statusCode = 404;
    throw err;
  }

  const { bills, transitions, datesToRecalc } = await recalculateAccount(existing.accountKey || accountKeyFor(existing), {
    transaction,
    actingUserId,
  });
  const bill = bills.find((b) => b.id === pendingBillId) || existing;
  const { becameApproved = false, noLongerApproved = false } = transitions[pendingBillId] || {};
  return { bill, becameApproved, noLongerApproved, datesToRecalc };
};

// Creates the Expense (AccountEntry, entryType EXPENSE) that mirrors one Pending Bill payment, in
// the same transaction as the payment itself. It carries exactly the payment's amount, date,
// method and bank, and always gets createdBy = the user who made/recorded the payment — never null
// (throws if there is nobody to attribute it to; `fallbackUserId` covers a legacy payment whose
// creator was since deleted). Linked back via referenceType "pendingBillPayment"/referenceId, which
// is also how the source is identified. Starts PENDING like any other Expense — an Admin approving
// it (existing Expense workflow) is what makes it count toward Total Out.
//
// Idempotent: (referenceType, referenceId) is uniquely indexed on account_entries, and an existing
// linked entry is returned as-is, so a payment can never produce two Expenses.
const createExpenseForPayment = async (payment, { accountName, fallbackUserId }, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: PAYMENT_REFERENCE_TYPE, referenceId: payment.id },
    transaction,
  });
  if (existing) return existing;

  const createdBy = payment.createdBy ?? fallbackUserId ?? null;
  if (!createdBy) {
    const err = new Error("Cannot create the linked expense: the payment has no user attached");
    err.statusCode = 500;
    throw err;
  }

  return AccountEntry.create(
    {
      entryType: "EXPENSE",
      category: "Expense",
      customerName: accountName,
      amount: payment.amount,
      entryDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      bankAccountId: payment.bankAccountId ?? null,
      description: `Pending Bill payment — ${accountName}${payment.notes ? ` (${payment.notes})` : ""}`,
      referenceType: PAYMENT_REFERENCE_TYPE,
      referenceId: payment.id,
      status: "PENDING",
      createdBy,
    },
    { transaction }
  );
};

// Removes the Expenses linked to the given payments (their bill is being deleted). Returns the
// dates whose Total Out need re-summing — only those where a removed Expense was APPROVED.
const removeExpensesForPayments = async (paymentIds, { transaction }) => {
  if (paymentIds.length === 0) return [];
  const where = { referenceType: PAYMENT_REFERENCE_TYPE, referenceId: { [Op.in]: paymentIds } };
  const entries = await AccountEntry.findAll({ where, transaction });
  const dates = entries.filter((e) => e.status === "APPROVED").map((e) => e.entryDate);
  await AccountEntry.destroy({ where, transaction });
  return dates;
};

module.exports = {
  LEGACY_ENTRY_CATEGORY,
  EPSILON,
  round2,
  isLive,
  loadAccountBills,
  loadAccountPayments,
  outstandingOf,
  recalculateAccount,
  recalculateStatus,
  createExpenseForPayment,
  removeExpensesForPayments,
};
