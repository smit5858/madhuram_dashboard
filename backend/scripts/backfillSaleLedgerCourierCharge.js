// One-off migration script — order.service.js#createOrder and sells.controller.js#updateSale used
// to write each sale's SALE customer-ledger debit as sellingAmount alone, so the courier charge
// (which the customer also owes — see order.service.js#computeOrderTotal) never reached the
// Debited Account / customer balance. The write sites are now fixed; this corrects the SALE
// entries that were already written that way.
//
// Only an entry whose amount is EXACTLY -sellingAmount is corrected (to -(sellingAmount +
// courierCharge)) — that is the signature of "courier charge was left out". An entry that already
// equals the order total (or anything else, e.g. hand-edited from the Ledger page) is left alone
// and reported, so a run can never double-count the charge or overwrite a manual correction.
// The existing entry is updated in place: no new rows, saleId/customerId link untouched.
//
// Usage:
//   node backend/scripts/backfillSaleLedgerCourierCharge.js           (dry run — prints, changes nothing)
//   node backend/scripts/backfillSaleLedgerCourierCharge.js --apply   (writes the corrections)
//
// Idempotent: after --apply, a re-run finds nothing left to correct.

const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { CustomerLedgerEntry, Sale } = require("../models");

const toCents = (value) => Math.round((parseFloat(value) || 0) * 100);

const run = async ({ apply = false } = {}) => {
  const t = await sequelize.transaction();
  try {
    const sales = await Sale.findAll({
      where: { courierCharge: { [Op.gt]: 0 }, status: { [Op.ne]: "CANCELLED" } },
      attributes: ["id", "invoiceNumber", "customerId", "sellingAmount", "courierCharge"],
      transaction: t,
    });

    console.log(`Found ${sales.length} non-cancelled sale(s) with a courier charge.`);

    let corrected = 0;
    let alreadyCorrect = 0;
    let skipped = 0;

    for (const sale of sales) {
      const entry = await CustomerLedgerEntry.findOne({ where: { saleId: sale.id, type: "SALE" }, transaction: t, lock: true });
      if (!entry) continue; // no customer on this sale (or zero total) — nothing was ever debited

      const current = -toCents(entry.amount);
      const selling = toCents(sale.sellingAmount);
      const total = selling + toCents(sale.courierCharge);

      if (current === total) {
        alreadyCorrect += 1;
      } else if (current === selling) {
        const label = sale.invoiceNumber || `sale #${sale.id}`;
        console.log(`${apply ? "Correcting" : "Would correct"} ${label}: ${current / 100} -> ${total / 100}`);
        if (apply) {
          entry.amount = -(total / 100);
          await entry.save({ transaction: t });
        }
        corrected += 1;
      } else {
        skipped += 1;
        console.warn(`Skipping ${sale.invoiceNumber || `sale #${sale.id}`}: ledger debit ${current / 100} matches neither selling amount (${selling / 100}) nor order total (${total / 100}) — review manually.`);
      }
    }

    if (apply) await t.commit();
    else await t.rollback();

    console.log(`${apply ? "Applied" : "Dry run"}: ${corrected} to correct, ${alreadyCorrect} already correct, ${skipped} skipped for manual review.`);
    if (!apply && corrected > 0) console.log("Re-run with --apply to write these changes.");
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
