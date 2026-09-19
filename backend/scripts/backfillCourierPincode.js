// One-off migration script — order.service.js#createOrder/addOrderItem/setCourierEntryForSale
// copied the Sale's address onto each Courier row they auto-create but never its pincode, so every
// sale-generated courier was saved with pincode = NULL even though the Sale has one. The create
// sites are now fixed (see order.service.js); this backfills the pre-existing rows from their
// Sale. Also fills a missing address the same way. Never overwrites a value that is already set,
// so anything an employee typed into a courier is left alone. Manual (non-sale) couriers have no
// Sale to read from and are not touched.
//
// Usage (from backend/): node scripts/backfillCourierPincode.js [--dry-run]
//
// Idempotent: only touches rows where pincode or address is still empty.

const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Courier, Sale } = require("../models");

const isEmpty = (v) => v === null || v === undefined || String(v).trim() === "";

const run = async ({ dryRun = process.argv.includes("--dry-run") } = {}) => {
  const t = await sequelize.transaction();
  try {
    const couriers = await Courier.findAll({
      where: {
        saleId: { [Op.ne]: null },
        [Op.or]: [{ pincode: null }, { pincode: "" }, { address: null }, { address: "" }],
      },
      transaction: t,
      lock: true,
    });

    console.log(`Found ${couriers.length} sale-linked courier row(s) with a missing pincode/address.`);

    const saleIds = [...new Set(couriers.map((c) => c.saleId))];
    const sales = await Sale.findAll({
      where: { id: saleIds },
      attributes: ["id", "pincode", "fromAddress"],
      transaction: t,
    });
    const saleById = new Map(sales.map((s) => [s.id, s]));

    let updated = 0;
    for (const courier of couriers) {
      const sale = saleById.get(courier.saleId);
      if (!sale) continue;
      let changed = false;
      if (isEmpty(courier.pincode) && !isEmpty(sale.pincode)) {
        courier.pincode = sale.pincode;
        changed = true;
      }
      if (isEmpty(courier.address) && !isEmpty(sale.fromAddress)) {
        courier.address = sale.fromAddress;
        changed = true;
      }
      if (!changed) continue;
      updated += 1;
      if (!dryRun) await courier.save({ transaction: t });
    }

    if (dryRun) {
      await t.rollback();
      console.log(`Dry run: ${updated} row(s) would be updated. Nothing was written.`);
    } else {
      await t.commit();
      console.log(`Backfill complete. ${updated} row(s) updated.`);
    }
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
