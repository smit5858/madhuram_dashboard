// One-off status correction for existing "Other Product" sale lines — run manually, NOT wired
// into server.js boot.
//
// An "Other Product" is any Sells line whose Product is non-catalog (Product.isMasterProduct =
// false): the pinned "Other" placeholder and every Quick Add product. That is the app's own
// definition (inventory.service.js#isNonInventoryProduct) — it is never matched by name. These
// products have no Stock row and bypass stock/backorder entirely, but lines saved before that
// change could be stuck as BACKORDERED with an OUT_OF_STOCK / WAITING_FOR_STOCK courier.
//
// What it changes (status columns only — it never creates or deletes a Sale, SaleItem, Courier,
// Product, Stock or StockMovement row, and never touches Stock/SerialUnit):
//   1. SaleItem of an Other Product with backorderedQuantity > 0
//        -> FULFILLED (backordered 0, allocated 0, fulfilled = quantity)
//      and the parent Sale.fulfillmentStatus is re-derived from its items.
//   2. Each non-cancelled Courier tied to such a line (Courier.saleItemId = SaleItem.id AND
//      Courier.saleId = SaleItem.saleId) still marked OUT_OF_STOCK -> IN_STOCK, and a
//      WAITING_FOR_STOCK courier -> PENDING (what a fresh Other Product sale gets, see
//      order.service.js#createOrder) so it continues through the normal Courier flow.
//
// Never touched: normal (isMasterProduct = true) products, genuinely backordered / out-of-stock
// catalog lines, cancelled lines/couriers, and couriers not linked to an Other Product line.
//
// Usage (from backend/):
//   node scripts/fixOtherProductStatuses.js            (dry run — lists what would change, writes nothing)
//   node scripts/fixOtherProductStatuses.js --apply    (writes the changes)
//
// Idempotent: a second run finds nothing to change.

const sequelize = require("../config/db");
const { SaleItem, Product, Courier } = require("../models");
const inventoryService = require("../services/inventory.service");
const { Op } = require("sequelize");

const run = async () => {
  const apply = process.argv.includes("--apply");
  const t = await sequelize.transaction();
  try {
    console.log(`Other Product Status Migration (${apply ? "APPLY" : "DRY RUN"})\n`);

    // Every live line of an Other Product — the courier pass below is keyed off this whole set
    // (not just backordered lines) so a courier whose line was already fixed is still corrected.
    const otherItems = await SaleItem.findAll({
      where: { fulfillmentStatus: { [Op.ne]: "CANCELLED" } },
      include: [{ model: Product, required: true, where: { isMasterProduct: false }, attributes: ["id", "name"] }],
      transaction: t,
      lock: { level: t.LOCK.UPDATE, of: SaleItem },
    });
    const itemsById = new Map(otherItems.map((i) => [i.id, i]));

    const backordered = otherItems.filter((i) => i.backorderedQuantity > 0);
    console.log(`Other Product Sell Items Found: ${backordered.length}`);

    const saleIds = new Set();
    for (const item of backordered) {
      console.log(
        `  sale #${item.saleId} item #${item.id} "${item.Product.name}" x${item.quantity}: ` +
          `${item.fulfillmentStatus} (backordered ${item.backorderedQuantity}) -> FULFILLED`
      );
      item.fulfilledQuantity = item.quantity;
      item.allocatedQuantity = 0;
      item.backorderedQuantity = 0;
      item.fulfillmentStatus = "FULFILLED";
      await item.save({ transaction: t });
      saleIds.add(item.saleId);
    }
    for (const saleId of saleIds) {
      await inventoryService.recomputeSaleFulfillmentStatus(saleId, { transaction: t });
    }

    // Couriers linked to an Other Product line by both saleItemId and saleId, still in the
    // wrong state. Anything not linked to one of the lines above is ignored.
    const candidates = otherItems.length
      ? await Courier.findAll({
          where: {
            saleItemId: { [Op.in]: otherItems.map((i) => i.id) },
            status: { [Op.ne]: "CANCELLED" },
            [Op.or]: [{ productStockStatus: "OUT_OF_STOCK" }, { status: "WAITING_FOR_STOCK" }],
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        })
      : [];
    const couriers = candidates.filter((c) => itemsById.get(c.saleItemId)?.saleId === c.saleId);

    console.log(`\nRelated Courier Items Found: ${couriers.length}`);
    for (const courier of couriers) {
      const changes = [];
      if (courier.productStockStatus === "OUT_OF_STOCK") {
        courier.productStockStatus = "IN_STOCK";
        changes.push("OUT_OF_STOCK -> IN_STOCK");
      }
      if (courier.status === "WAITING_FOR_STOCK") {
        courier.status = "PENDING";
        courier.pending = true;
        changes.push("WAITING_FOR_STOCK -> PENDING");
      }
      console.log(`  courier #${courier.id} (sale #${courier.saleId} item #${courier.saleItemId}): ${changes.join(", ")}`);
      await courier.save({ transaction: t });
    }

    // Lines fixed above that have no live courier at all (courier entry was off for that sale).
    const itemsWithCourier = new Set(
      (backordered.length
        ? await Courier.findAll({
            where: { saleItemId: { [Op.in]: backordered.map((i) => i.id) }, status: { [Op.ne]: "CANCELLED" } },
            attributes: ["saleItemId", "saleId"],
            transaction: t,
          })
        : []
      )
        .filter((c) => itemsById.get(c.saleItemId)?.saleId === c.saleId)
        .map((c) => c.saleItemId)
    );
    const noCourier = backordered.filter((i) => !itemsWithCourier.has(i.id)).length;

    console.log("\nSummary");
    console.log(`  Other Product Sell Items Found: ${backordered.length}`);
    console.log(`  Sells Status Updated:           ${backordered.length}`);
    console.log(`  Related Courier Items Found:    ${couriers.length}`);
    console.log(`  Courier Status Updated:         ${couriers.length}`);
    console.log(`  Skipped / No Courier:           ${noCourier}`);

    if (apply) {
      await t.commit();
      console.log("\nMigration completed successfully.");
    } else {
      await t.rollback();
      console.log("\nDry run only — nothing was written. Re-run with --apply to make these changes.");
    }
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("Migration failed, rolled back:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  run().then(() => process.exit(0));
}

module.exports = run;
