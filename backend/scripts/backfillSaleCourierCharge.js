// One-off migration script — order.service.js#createOrder used to create a sale's Outgoing
// Courier rows without its courierCharge, so the charge entered on the Sells form never showed
// in Courier → Outgoing Courier or in the monthly Courier Charge total (a SUM over
// Courier.charge — see courierCharge.service.js). The write sites now carry it over (see
// order.service.js#syncSaleCourierCharge); this fills it in for sales created before that.
//
// Only a sale whose active Outgoing Courier rows carry NO charge at all is filled in (the
// charge goes onto one row, never every product row). A sale whose rows already have a charge
// (e.g. typed in by hand from the Courier module) is left alone and reported, so a run can
// never double-count the charge or overwrite a manual entry.
//
// Usage:
//   node backend/scripts/backfillSaleCourierCharge.js           (dry run — prints, changes nothing)
//   node backend/scripts/backfillSaleCourierCharge.js --apply   (writes the corrections)
//
// Idempotent: after --apply, a re-run finds nothing left to fill in.

const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Courier, Sale } = require("../models");
const { syncSaleCourierCharge } = require("../services/order.service");

const toCents = (value) => Math.round((parseFloat(value) || 0) * 100);

const run = async ({ apply = false } = {}) => {
  const t = await sequelize.transaction();
  try {
    const sales = await Sale.findAll({
      where: { courierCharge: { [Op.gt]: 0 }, status: { [Op.ne]: "CANCELLED" } },
      attributes: ["id", "invoiceNumber", "courierCharge"],
      transaction: t,
    });

    console.log(`Found ${sales.length} non-cancelled sale(s) with a courier charge.`);

    let filled = 0;
    let alreadyCorrect = 0;
    let skipped = 0;

    for (const sale of sales) {
      const rows = await Courier.findAll({
        where: { saleId: sale.id, direction: "OUT", status: { [Op.ne]: "CANCELLED" } },
        attributes: ["id", "charge"],
        transaction: t,
        lock: true,
      });
      if (rows.length === 0) continue; // no courier entry for this sale — nothing to show it on

      const label = sale.invoiceNumber || `sale #${sale.id}`;
      const charged = rows.filter((r) => toCents(r.charge) > 0);
      const rowTotal = charged.reduce((sum, r) => sum + toCents(r.charge), 0);
      const saleCharge = toCents(sale.courierCharge);

      if (charged.length === 0) {
        console.log(`${apply ? "Filling" : "Would fill"} ${label}: courier charge ${saleCharge / 100}`);
        if (apply) await syncSaleCourierCharge(sale.id, { transaction: t });
        filled += 1;
      } else if (charged.length === 1 && rowTotal === saleCharge) {
        alreadyCorrect += 1;
      } else {
        skipped += 1;
        console.warn(`Skipping ${label}: courier rows already carry ${rowTotal / 100} across ${charged.length} row(s), sale charge is ${saleCharge / 100} — review manually.`);
      }
    }

    if (apply) await t.commit();
    else await t.rollback();

    console.log(`${apply ? "Applied" : "Dry run"}: ${filled} to fill, ${alreadyCorrect} already correct, ${skipped} skipped for manual review.`);
    if (!apply && filled > 0) console.log("Re-run with --apply to write these changes.");
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("Backfill failed, rolled back:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  run({ apply: process.argv.includes("--apply") }).then(() => process.exit(0));
}

module.exports = run;
