const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { AccountEntry, DailyAccountBalance } = require("../models");

const toAmount = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Latest existing row strictly before `date`, or 0 if this is the first-ever record.
const getPreviousClosing = async (date, { transaction } = {}) => {
  const previous = await DailyAccountBalance.findOne({
    where: { date: { [Op.lt]: date } },
    order: [["date", "DESC"]],
    transaction,
  });
  return previous ? toAmount(previous.closingBalance) : 0;
};

const recalculateOne = async (date, transaction) => {
  const sums = await AccountEntry.findAll({
    // Only APPROVED rows count — a PENDING Expense must not affect the balance until an Admin
    // approves it (see accountEntry.model.js#status).
    where: { entryDate: date, status: "APPROVED" },
    attributes: ["entryType", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
    group: ["entryType"],
    raw: true,
    transaction,
  });

  let totalIn = 0;
  let totalOut = 0;
  for (const row of sums) {
    if (row.entryType === "INCOME") totalIn = toAmount(row.total);
    else if (row.entryType === "EXPENSE") totalOut = toAmount(row.total);
  }

  const opening = await getPreviousClosing(date, { transaction });
  const closing = toAmount(opening + totalIn - totalOut);

  const existing = await DailyAccountBalance.findOne({
    where: { date },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  let changed = true;
  if (existing) {
    changed =
      toAmount(existing.openingBalance) !== opening ||
      toAmount(existing.totalIn) !== totalIn ||
      toAmount(existing.totalOut) !== totalOut ||
      toAmount(existing.closingBalance) !== closing;
    if (changed) {
      existing.openingBalance = opening;
      existing.totalIn = totalIn;
      existing.totalOut = totalOut;
      existing.closingBalance = closing;
      await existing.save({ transaction });
    }
  } else {
    await DailyAccountBalance.create(
      { date, openingBalance: opening, totalIn, totalOut, closingBalance: closing },
      { transaction }
    );
  }

  return changed;
};

/**
 * Recomputes a single day's Income/Expense totals and opening/closing balance, then cascades
 * forward to the next day ONLY if a row for it already exists (a future day with no activity
 * yet has nothing to cascade into — it will pick up the right opening balance the first time
 * it is itself recalculated). Safe to call repeatedly/concurrently: the unique index on `date`
 * plus a per-call transaction + row lock prevent duplicate rows or lost updates.
 */
const recalculateDay = async (date, { transaction: outerTransaction } = {}) => {
  const cascade = async (transaction) => {
    let cursor = date;
    // Bounded by existing rows only — never manufactures balance rows for days with no activity.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const changed = await recalculateOne(cursor, transaction);
      if (!changed) break;
      const nextDate = addDays(cursor, 1);
      const nextExists = await DailyAccountBalance.findOne({ where: { date: nextDate }, transaction });
      if (!nextExists) break;
      cursor = nextDate;
    }
  };

  if (outerTransaction) {
    await cascade(outerTransaction);
    return;
  }
  await sequelize.transaction((transaction) => cascade(transaction));
};

module.exports = { recalculateDay, getPreviousClosing };
