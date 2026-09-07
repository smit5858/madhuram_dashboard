const { Op } = require("sequelize");
const dayjs = require("dayjs");
const sequelize = require("../config/db");
const { Courier, CourierCharge } = require("../models");

// The "Courier Charge" pill (Header.tsx, backed by courierCharge.controller.js) used to be a
// figure nothing in the app ever actually set — only read and reset to 0. It's now a derived
// running total: SUM(charge) over every non-free, non-cancelled Outgoing courier whose entryDate
// falls in that calendar month. Call recalculateCourierChargeForDates after any change that could
// move a courier in or out of that sum (create/edit/delete a courier, or cancel the sale/order
// item it's linked to) so the pill reflects reality without a manual step.
const recalculateCourierChargeForMonth = async (month, year, { transaction } = {}) => {
  const start = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const end = start.endOf("month");

  const result = await Courier.findOne({
    where: {
      direction: "OUT",
      freePickup: false,
      status: { [Op.ne]: "CANCELLED" },
      entryDate: { [Op.between]: [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")] },
    },
    attributes: [[sequelize.fn("SUM", sequelize.col("charge")), "total"]],
    raw: true,
    transaction,
  });

  const amount = parseFloat(result?.total) || 0;

  const [record] = await CourierCharge.findOrCreate({
    where: { month, year },
    defaults: { amount },
    transaction,
  });
  if (parseFloat(record.amount) !== amount) {
    record.amount = amount;
    await record.save({ transaction });
  }
  return record;
};

// Recalculates whichever month(s) the given entryDate(s) fall in — pass both the old and new
// entryDate when a courier's date itself changed, so a charge moved across a month boundary
// gets removed from one month's total and added to the other's. Null/invalid dates are skipped
// (nothing to attribute a charge to).
const recalculateCourierChargeForDates = async (dates, { transaction } = {}) => {
  const months = new Set();
  for (const d of dates || []) {
    if (!d) continue;
    const parsed = dayjs(d);
    if (!parsed.isValid()) continue;
    months.add(`${parsed.year()}-${parsed.month() + 1}`);
  }
  for (const key of months) {
    const [year, month] = key.split("-").map(Number);
    await recalculateCourierChargeForMonth(month, year, { transaction });
  }
};

module.exports = { recalculateCourierChargeForMonth, recalculateCourierChargeForDates };
