// One-off migration script — run manually once after deploying the new SaleItem columns
// (allocatedQuantity/fulfilledQuantity/backorderedQuantity/fulfillmentStatus enum change).
// NOT wired into server.js boot — sync({alter:true}) can add these columns but cannot
// transform pre-existing data or remap old enum values, so this fills that gap.
//
// Usage: node backend/scripts/backfillSaleItemFulfillment.js
//
// Idempotent: only touches rows where allocatedQuantity/fulfilledQuantity/backorderedQuantity
// are all still 0 AND the legacy fulfillmentStatus is one of the old enum values — running it
// twice is a no-op the second time.
//
// IMPORTANT: dry-run this against a staging copy of the database first. Compare row counts
// and the sum of (fulfilledQuantity + allocatedQuantity + backorderedQuantity) against the
// sum of `quantity` before and after — they must match exactly.

const sequelize = require("../config/db");
const { SaleItem } = require("../models");
const { Op } = require("sequelize");

const LEGACY_STATUSES = ["FULFILLED", "PARTIAL", "OUT_OF_STOCK"];

const run = async () => {
  const t = await sequelize.transaction();
  try {
    const items = await SaleItem.findAll({
      where: {
        fulfillmentStatus: { [Op.in]: LEGACY_STATUSES },
        allocatedQuantity: 0,
        fulfilledQuantity: 0,
        backorderedQuantity: 0,
      },
      transaction: t,
      lock: true,
    });

    console.log(`Found ${items.length} legacy sale item(s) to backfill.`);

    let sumBefore = 0;
    let sumAfter = 0;

    for (const item of items) {
      sumBefore += item.quantity;
      const shortage = item.shortageQuantity || 0;

      if (item.fulfillmentStatus === "FULFILLED") {
        item.fulfilledQuantity = item.quantity;
        item.allocatedQuantity = 0;
        item.backorderedQuantity = 0;
        item.fulfillmentStatus = "FULFILLED";
      } else if (item.fulfillmentStatus === "PARTIAL") {
        item.fulfilledQuantity = Math.max(0, item.quantity - shortage);
        item.allocatedQuantity = 0;
        item.backorderedQuantity = shortage;
        item.fulfillmentStatus = "PARTIALLY_FULFILLED";
      } else if (item.fulfillmentStatus === "OUT_OF_STOCK") {
        item.fulfilledQuantity = 0;
        item.allocatedQuantity = 0;
        item.backorderedQuantity = item.quantity;
        item.fulfillmentStatus = "BACKORDERED";
      }

      sumAfter += item.fulfilledQuantity + item.allocatedQuantity + item.backorderedQuantity;
      await item.save({ transaction: t });
    }

    if (sumBefore !== sumAfter) {
      throw new Error(
        `Invariant check failed: sum(quantity)=${sumBefore} !== sum(fulfilled+allocated+backordered)=${sumAfter}. Rolling back.`
      );
    }

    await t.commit();
    console.log(`Backfill complete. ${items.length} row(s) updated. Invariant check passed (${sumAfter} units).`);
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
