// One-off review/repair script — run manually after deploying the "serial numbers are assigned
// only in the Courier module" change (see inventory.service.js#reserveStock / #reassignSerials).
// NOT wired into server.js boot. Take a database backup before running with --apply.
//
// Before that change, creating a sale (or receiving stock against a backorder) silently claimed
// the first AVAILABLE serial units for each SERIALIZED line (FIFO) and usually marked them SOLD.
// Those lines are recognizable by SaleItem.serialsManuallySelected === false — the old code set
// it on every FIFO pick, and a real Courier pick always sets it to true.
//
// A FIFO-held unit is released back to AVAILABLE only when that is provably safe:
//   - its line (and sale) is not cancelled,
//   - the line still has an active Courier entry that hasn't started processing
//     (PENDING / WAITING_FOR_STOCK) — so the unit can't have physically left yet,
//   - nobody has touched that unit manually since (no serialUnit-level stock movement).
// The line keeps its stock claim (it's counted, not tied to a unit), so stock totals don't
// change; the Courier picker then shows it as "Not Selected" and the right unit gets picked
// there. Everything else (already shipped / in progress / walk-in sales without a courier /
// lines created before serialsManuallySelected existed) is listed for review and left alone.
//
// Usage:
//   node backend/scripts/reviewAutoAssignedSerials.js            (dry run — prints what would change)
//   node backend/scripts/reviewAutoAssignedSerials.js --apply    (writes the changes)
//
// Idempotent: a released unit is no longer linked to the line, so a second run finds nothing.

const sequelize = require("../config/db");
const { SaleItem, Sale, Product, SerialUnit, Courier, StockMovement } = require("../models");
const inventoryService = require("../services/inventory.service");
const { Op } = require("sequelize");

const SAFE_COURIER_STATUSES = ["PENDING", "WAITING_FOR_STOCK"];

const run = async () => {
  const apply = process.argv.includes("--apply");
  const t = await sequelize.transaction();
  try {
    const items = await SaleItem.findAll({
      where: { serialsManuallySelected: false, fulfillmentStatus: { [Op.ne]: "CANCELLED" } },
      include: [
        { model: Product, required: true, where: { productType: "SERIALIZED" }, attributes: ["id", "name"] },
        { model: Sale, required: true, where: { status: { [Op.ne]: "CANCELLED" } }, attributes: ["id", "invoiceNumber", "customerName"] },
      ],
      order: [["id", "ASC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    console.log(`${apply ? "APPLY" : "DRY RUN"}: ${items.length} SERIALIZED sale line(s) with auto-picked (FIFO) serial state.`);

    let released = 0;
    let skipped = 0;
    for (const item of items) {
      const units = await SerialUnit.findAll({
        where: { saleItemId: item.id, status: { [Op.in]: ["RESERVED", "SOLD"] } },
        order: [["id", "ASC"]],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (units.length === 0) continue;

      const label = `sale #${item.saleId} (${item.Sale.invoiceNumber}, ${item.Sale.customerName}) item #${item.id} "${item.Product.name}"`;
      const couriers = await Courier.findAll({
        where: { saleItemId: item.id, status: { [Op.ne]: "CANCELLED" } },
        attributes: ["id", "status"],
        transaction: t,
      });

      let reason = null;
      if (couriers.length === 0) reason = "no active courier entry (walk-in / courier disabled)";
      else if (!couriers.every((c) => SAFE_COURIER_STATUSES.includes(c.status)))
        reason = `courier already ${couriers.map((c) => c.status).join("/")}`;

      for (const unit of units) {
        const manualEdits = await StockMovement.count({
          where: { referenceType: "serialUnit", referenceId: unit.id },
          transaction: t,
        });
        const unitReason = reason || (manualEdits > 0 ? "unit was edited manually in Inventory" : null);
        if (unitReason) {
          skipped++;
          console.log(`  KEEP    ${label}: ${unit.serialNumber} (${unit.status}) — ${unitReason}`);
          continue;
        }

        console.log(`  RELEASE ${label}: ${unit.serialNumber} (${unit.status}) -> AVAILABLE`);
        const fromStatus = unit.status;
        unit.status = "AVAILABLE";
        unit.saleItemId = null;
        unit.soldAt = null;
        await unit.save({ transaction: t });
        await StockMovement.create(
          {
            productId: unit.productId,
            type: "ADJUSTMENT",
            quantity: 0,
            reservedDelta: 0,
            referenceType: "saleItem",
            referenceId: item.id,
            createdBy: null,
            notes: `Released auto-assigned serial ${unit.serialNumber} (${fromStatus}) from sale item #${item.id} — to be picked in Courier`,
          },
          { transaction: t }
        );
        released++;
      }
    }

    // Report products whose sale claims exceed the units actually on hand (oversold before this
    // fix, or units written off since) — these need a stock check, nothing is changed for them.
    const productIds = (await Product.findAll({ where: { productType: "SERIALIZED" }, attributes: ["id"], transaction: t })).map((p) => p.id);
    for (const productId of productIds) {
      const counts = await inventoryService.getSerialAvailability(productId, { transaction: t });
      const onHand = await SerialUnit.count({ where: { productId, status: "AVAILABLE" }, transaction: t });
      if (counts.unassigned > onHand) {
        console.log(`  WARNING product #${productId}: ${counts.unassigned} sold/reserved unit(s) without serials but only ${onHand} AVAILABLE unit(s)`);
      }
    }

    if (apply) {
      await t.commit();
      console.log(`Done. Released ${released} unit(s); kept ${skipped} for manual review.`);
    } else {
      await t.rollback();
      console.log(`Dry run only — nothing was written. Would release ${released} unit(s); ${skipped} kept for review. Re-run with --apply.`);
    }
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("Review failed, rolled back:", err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  run().then(() => process.exit(0));
}

module.exports = run;
