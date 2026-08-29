// One-off migration script — run manually once after deploying the shipmentGroupId/shipmentType
// columns on Courier. NOT wired into server.js boot — sync({alter:true}) adds the columns but
// leaves them null on pre-existing rows, and the shipment-group-readiness/gating logic in
// inventory.service.js treats a null shipmentGroupId as "no group" (ungated), so pre-existing
// sale-linked rows must be backfilled before that logic is relied on.
//
// Usage: node backend/scripts/backfillCourierShipmentGroups.js
//
// Idempotent: only touches rows where saleId is set and shipmentGroupId is still null.

const sequelize = require("../config/db");
const { Courier } = require("../models");
const { Op } = require("sequelize");

const run = async () => {
  const t = await sequelize.transaction();
  try {
    const couriers = await Courier.findAll({
      where: {
        saleId: { [Op.ne]: null },
        shipmentGroupId: null,
      },
      transaction: t,
      lock: true,
    });

    console.log(`Found ${couriers.length} sale-linked courier row(s) to backfill.`);

    for (const courier of couriers) {
      courier.shipmentGroupId = `SALE-${courier.saleId}`;
      courier.shipmentType = "SHIP_COMPLETE";
      await courier.save({ transaction: t });
    }

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
