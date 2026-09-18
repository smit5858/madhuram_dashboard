// One-off migration script — order.service.js#createOrder/addOrderItem/setCourierEntryForSale
// never set entryDate on the Courier rows they auto-create for a Sale, so every sale-generated
// courier ended up with entryDate = NULL. Since the Outgoing Courier date filter compares
// entryDate with Op.gte/Op.lte, a NULL entryDate never matches any date range — these rows were
// silently invisible under any date filter. The create-site bug is now fixed (see
// order.service.js), but pre-existing rows still have entryDate = NULL and need this one-time
// backfill. Uses each row's createdAt date as the best available approximation of when it was
// entered, then recalculates the Courier Charge total for every month touched.
//
// Usage: node backend/scripts/backfillCourierEntryDate.js
//
// Idempotent: only touches rows where entryDate is still null.

const dayjs = require("dayjs");
const sequelize = require("../config/db");
const { Courier } = require("../models");
const { recalculateCourierChargeForDates } = require("../services/courierCharge.service");

const run = async () => {
  const t = await sequelize.transaction();
  try {
    const couriers = await Courier.findAll({
      where: { entryDate: null },
      transaction: t,
      lock: true,
    });

    console.log(`Found ${couriers.length} courier row(s) with a null entryDate to backfill.`);

    const newDates = [];
    for (const courier of couriers) {
      const entryDate = dayjs(courier.createdAt).format("YYYY-MM-DD");
      courier.entryDate = entryDate;
      newDates.push(entryDate);
      await courier.save({ transaction: t });
    }

    await recalculateCourierChargeForDates(newDates, { transaction: t });

    await t.commit();
    console.log(`Backfill complete. ${couriers.length} row(s) updated.`);
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("Backfill failed, rolled back:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  run().then(() => process.exit(0));
}

module.exports = run;
