// One-off repair script — run manually once after deploying the "Quick Add / Other products
// bypass stock & backorder" change (see inventory.service.js#isNonInventoryProduct).
// NOT wired into server.js boot.
//
// Before that change, a sale line for a Quick Add Product (or the "Other" placeholder, for
// hardware-typed rows) could be saved as BACKORDERED with a WAITING_FOR_STOCK courier that nothing
// would ever unblock, because these products are never stocked. This finds those still-open lines
// and moves them onto the normal flow: nothing backordered, allocated in full, courier PENDING /
// IN_STOCK, and (once the whole shipment group is ready) fulfilled — same as a fresh sale would be.
//
// Usage:
//   node backend/scripts/fixNonInventoryBackorders.js            (dry run — prints what would change)
//   node backend/scripts/fixNonInventoryBackorders.js --apply    (writes the changes)
//
// Idempotent: only touches non-cancelled lines of non-catalog products that still have a
// backordered quantity, so a second run finds nothing. Normal catalog products are never touched.

const sequelize = require("../config/db");
const { SaleItem, Product, Courier } = require("../models");
const inventoryService = require("../services/inventory.service");
const { Op } = require("sequelize");

const run = async () => {
  const apply = process.argv.includes("--apply");
  const t = await sequelize.transaction();
  try {
    const items = await SaleItem.findAll({
      where: { backorderedQuantity: { [Op.gt]: 0 }, fulfillmentStatus: { [Op.ne]: "CANCELLED" } },
      include: [{ model: Product, required: true, where: { isMasterProduct: false } }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    console.log(`${apply ? "APPLY" : "DRY RUN"}: found ${items.length} backordered non-inventory sale line(s).`);

    const groups = new Set();
    const saleIds = new Set();

    for (const item of items) {
      console.log(
        `  sale #${item.saleId} item #${item.id} "${item.Product.name}" x${item.quantity}: ` +
          `${item.fulfillmentStatus} (backordered ${item.backorderedQuantity}) -> allocated`
      );

      item.allocatedQuantity += item.backorderedQuantity;
      item.backorderedQuantity = 0;
      item.fulfillmentStatus = inventoryService.computeItemFulfillmentStatus(item);
      await item.save({ transaction: t });
      saleIds.add(item.saleId);

      const couriers = await Courier.findAll({
        where: { saleItemId: item.id, status: { [Op.ne]: "CANCELLED" } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      for (const courier of couriers) {
        if (courier.productStockStatus === "OUT_OF_STOCK") {
          courier.productStockStatus = "IN_STOCK";
          await courier.save({ transaction: t });
        }
        if (courier.shipmentGroupId) groups.add(courier.shipmentGroupId);
      }
    }

    // Fulfills each affected shipment group if it's now fully allocated (and un-waits its
    // couriers) — a group still holding a genuinely out-of-stock normal product stays waiting.
    for (const groupId of groups) {
      await inventoryService.tryFulfillReadyGroup(groupId, { userId: null, transaction: t });
    }
    // Lines with no courier at all (courier entry was off) have no group — fulfill directly.
    for (const item of items) {
      await item.reload({ transaction: t });
      const hasCourier = await Courier.count({ where: { saleItemId: item.id, status: { [Op.ne]: "CANCELLED" } }, transaction: t });
      if (!hasCourier && item.allocatedQuantity > 0) {
        await inventoryService.fulfillStock(
          { productId: item.productId, saleItemId: item.id, quantity: item.allocatedQuantity, userId: null },
          { transaction: t }
        );
      }
    }
    for (const saleId of saleIds) {
      await inventoryService.recomputeSaleFulfillmentStatus(saleId, { transaction: t });
    }

    if (apply) {
      await t.commit();
      console.log(`Done. ${items.length} line(s) repaired across ${saleIds.size} sale(s).`);
    } else {
      await t.rollback();
      console.log("Dry run only — nothing was written. Re-run with --apply to make these changes.");
    }
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("Repair failed, rolled back:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  run().then(() => process.exit(0));
}

module.exports = run;
