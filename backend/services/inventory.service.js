const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Product, Stock, StockMovement, SerialUnit, SaleItem, Sale, Courier } = require("../models");

// No per-product threshold field exists yet — a single constant is enough for now,
// trivial to promote to a Product column later if the business wants it configurable.
const LOW_STOCK_THRESHOLD = 5;

// Product types that carry a Stock row and go through the exact same reserve/fulfill/receive
// mechanics. HARDWARE_ORDER_BASED is stock-tracked identically to NON_SERIAL — it just always
// starts at quantity 0 and is expected to sit backordered until "Receive Stock" is used against
// it once the hardware has been arranged/purchased for a specific order. SOFTWARE and SERIALIZED
// are each handled by their own dedicated branch wherever this constant is checked.
const STOCK_TRACKED_TYPES = ["NON_SERIAL", "HARDWARE_ORDER_BASED"];

// Every exported function accepts an optional { transaction }. If omitted, the function
// opens and commits/rolls back its own transaction (self-contained, callable directly from
// a controller). If passed, it participates in the caller's transaction and never
// commits/rolls back itself (composable — lets order.service run several of these atomically).
const withTransaction = async (transaction, fn) => {
  if (transaction) return fn(transaction);
  const t = await sequelize.transaction();
  try {
    const result = await fn(t);
    await t.commit();
    return result;
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
};

const assertProduct = (product) => {
  if (!product) {
    const err = new Error("Product not found");
    err.statusCode = 404;
    throw err;
  }
};

// Stock (quantity/reserved) only exists for stock-tracked products (NON_SERIAL and
// HARDWARE_ORDER_BASED) — SERIALIZED availability is always derived from serial_units, never
// from a stored counter, and SOFTWARE has no stock concept at all. Callers that only make sense
// against a Stock row (manual quantity adjustment) must use this instead of assertProduct.
const assertNonSerial = (product) => {
  assertProduct(product);
  if (!STOCK_TRACKED_TYPES.includes(product.productType)) {
    const err = new Error(
      "This operation is only available for stock-tracked products — use serial unit receive/inspect operations instead"
    );
    err.statusCode = 400;
    throw err;
  }
};

// Serial numbers are never picked when a sale is created or edited — they're assigned only from
// the Courier module (see reassignSerials). A SERIALIZED sale line therefore claims stock by
// count: its allocated + fulfilled - returned quantity, of which only the part already backed by
// an assigned (RESERVED/SOLD) unit is visible in serial_units. The rest is this "unassigned
// demand" — AVAILABLE units that are spoken for by a sale but don't have a serial picked yet.
// Free stock for a new sale is AVAILABLE minus this demand. Returns { [productId]: count }.
const getUnassignedSerialDemand = async (productIds, { transaction } = {}) => {
  const ids = (Array.isArray(productIds) ? productIds : [productIds]).map(Number).filter(Boolean);
  if (ids.length === 0) return {};
  const rows = await sequelize.query(
    `SELECT si.productId AS productId,
            SUM(GREATEST(si.allocatedQuantity + si.fulfilledQuantity - si.returnedQuantity - COALESCE(h.held, 0), 0)) AS unassigned
       FROM sells_items si
       JOIN sells s ON s.id = si.saleId AND s.status <> 'CANCELLED'
       LEFT JOIN (
         SELECT saleItemId, COUNT(*) AS held
           FROM serial_units
          WHERE saleItemId IS NOT NULL AND status IN ('RESERVED', 'SOLD')
          GROUP BY saleItemId
       ) h ON h.saleItemId = si.id
      WHERE si.productId IN (:ids) AND si.fulfillmentStatus <> 'CANCELLED'
      GROUP BY si.productId`,
    { replacements: { ids }, type: sequelize.QueryTypes.SELECT, transaction }
  );
  const byProduct = {};
  for (const row of rows) byProduct[row.productId] = parseInt(row.unassigned, 10) || 0;
  return byProduct;
};

// SERIALIZED availability/reserved/sold, derived on read from serial_units — the sole
// source of truth for SERIALIZED products. No counter to keep in sync, nothing to drift.
// `available` excludes AVAILABLE units already claimed by a sale awaiting serial selection.
const getSerialAvailability = async (productId, { transaction } = {}) => {
  const rows = await SerialUnit.findAll({
    where: { productId },
    attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    group: ["status"],
    raw: true,
    transaction,
  });
  const counts = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, RETURNED: 0, DAMAGED: 0, LOST: 0 };
  for (const row of rows) counts[row.status] = parseInt(row.count, 10) || 0;
  const unassigned = (await getUnassignedSerialDemand(productId, { transaction }))[productId] || 0;
  return {
    available: Math.max(0, counts.AVAILABLE - unassigned),
    reserved: counts.RESERVED,
    sold: counts.SOLD,
    unassigned,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  };
};

// Non-catalog products (isMasterProduct: false) — the Sells form's pinned "Other" placeholder and
// any Quick Add Product — are never stocked, so they bypass every stock/backorder/restock step:
// nothing is checked, reserved, deducted, released or restocked, and no Stock row is created for
// them. They're always fully "allocated" and go straight to the normal Courier flow.
const isNonInventoryProduct = (product) => !!product && product.isMasterProduct === false;

const computeItemFulfillmentStatus = (item) => {
  if (item.fulfillmentStatus === "CANCELLED") return "CANCELLED";
  if (item.fulfilledQuantity >= item.quantity) return "FULFILLED";
  if (item.fulfilledQuantity > 0) return "PARTIALLY_FULFILLED";
  if (item.backorderedQuantity > 0) return "BACKORDERED";
  return "PENDING";
};

// Aggregates child SaleItem.fulfillmentStatus into the parent Sale.fulfillmentStatus.
// Internal helper — not exposed as a route.
const recomputeSaleFulfillmentStatus = async (saleId, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const sale = await Sale.findByPk(saleId, { transaction: t, lock: true });
    if (!sale) return null;

    const items = await SaleItem.findAll({ where: { saleId }, transaction: t });
    if (items.length === 0) return sale;

    const active = items.filter((i) => i.fulfillmentStatus !== "CANCELLED");

    let status;
    if (active.length === 0) {
      status = "CANCELLED";
    } else if (active.every((i) => i.fulfillmentStatus === "FULFILLED")) {
      status = "FULFILLED";
    } else if (active.some((i) => i.fulfilledQuantity > 0)) {
      status = "PARTIALLY_FULFILLED";
    } else if (active.some((i) => i.backorderedQuantity > 0)) {
      status = "BACKORDERED";
    } else {
      status = "PENDING";
    }

    if (sale.fulfillmentStatus !== status) {
      sale.fulfillmentStatus = status;
      await sale.save({ transaction: t });
    }
    return sale;
  });
};

// Recomputes a single item's derived fulfillmentStatus, then rolls that up to the Sale.
const recomputeItemAndSaleStatus = async (item, { transaction }) => {
  const newStatus = computeItemFulfillmentStatus(item);
  if (item.fulfillmentStatus !== newStatus) {
    item.fulfillmentStatus = newStatus;
    await item.save({ transaction });
  }
  await recomputeSaleFulfillmentStatus(item.saleId, { transaction });
};

const getOrCreateStock = async (productId, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const product = await Product.findByPk(productId, { transaction: t });
    assertNonSerial(product);
    const [stock] = await Stock.findOrCreate({
      where: { productId },
      defaults: { productId, quantity: 0, reserved: 0 },
      transaction: t,
      lock: true,
    });
    return stock;
  });
};

// Reserves up to `quantity` units for a SaleItem. Never over-reserves: allocates as much as
// is currently available and reports the rest as backordered. Caller is responsible for
// writing the resulting allocated/backordered split onto the SaleItem.
// For SERIALIZED products this is a count-only claim: no serial unit is selected, reserved or
// otherwise touched — serial numbers are assigned exclusively from the Courier module (see
// reassignSerials). The Product row lock serializes concurrent claims on the same product; it
// must be taken before the transaction's first non-locking read so the free-stock count below
// sees every claim committed before this one (see createOrder, which locks its products first).
const reserveStock = async ({ productId, saleItemId, quantity, userId }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const product = await Product.findByPk(productId, { transaction: t, lock: true });
    assertProduct(product);

    // Non-inventory (Other / Quick Add): no stock check at all — always fully allocated, never
    // backordered, no Stock row read or written.
    if (isNonInventoryProduct(product)) {
      return { allocated: quantity, backordered: 0, serialUnitIds: [], available: null };
    }

    // SOFTWARE: no Stock/SerialUnit row ever exists — nothing physical to run out of, so every
    // request is always fully allocated immediately, no backorder possible.
    if (product.productType === "SOFTWARE") {
      return { allocated: quantity, backordered: 0, serialUnitIds: [], available: null };
    }

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      const [stock] = await Stock.findOrCreate({
        where: { productId },
        defaults: { productId, quantity: 0, reserved: 0 },
        transaction: t,
        lock: true,
      });

      const available = stock.quantity - stock.reserved;
      const allocated = Math.max(0, Math.min(available, quantity));
      const backordered = quantity - allocated;

      if (allocated > 0) {
        stock.reserved += allocated;
        await stock.save({ transaction: t });

        await StockMovement.create(
          {
            productId,
            type: "RESERVATION",
            quantity: 0,
            reservedDelta: allocated,
            referenceType: "saleItem",
            referenceId: saleItemId,
            createdBy: userId,
            notes: `Reserved ${allocated} unit(s) for sale item #${saleItemId}`,
          },
          { transaction: t }
        );
      }

      return { allocated, backordered, serialUnitIds: [], available: stock.quantity - stock.reserved };
    }

    // SERIALIZED — claim by count against free stock (AVAILABLE units not already spoken for by
    // another sale line); serial_units rows are left exactly as they are.
    const { available: free } = await getSerialAvailability(productId, { transaction: t });
    const allocated = Math.max(0, Math.min(free, quantity));
    const backordered = quantity - allocated;

    if (allocated > 0) {
      await StockMovement.create(
        {
          productId,
          type: "RESERVATION",
          quantity: 0,
          reservedDelta: allocated,
          referenceType: "saleItem",
          referenceId: saleItemId,
          createdBy: userId,
          notes: `Reserved ${allocated} unit(s) for sale item #${saleItemId} — serial numbers to be selected in Courier`,
        },
        { transaction: t }
      );
    }

    return { allocated, backordered, serialUnitIds: [], available: free - allocated };
  });
};

// Releases a previously-reserved (not yet fulfilled) quantity back to available stock.
const releaseReservation = async ({ productId, saleItemId, quantity, userId, reason }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!quantity || quantity <= 0) return;
    const product = await Product.findByPk(productId, { transaction: t });
    assertProduct(product);

    // SOFTWARE and non-inventory (Other / Quick Add) lines never reserve against a Stock row (see
    // reserveStock) — nothing to release.
    if (product.productType === "SOFTWARE" || isNonInventoryProduct(product)) return;

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      const stock = await Stock.findOne({ where: { productId }, transaction: t, lock: true });
      if (!stock) return;

      stock.reserved = Math.max(0, stock.reserved - quantity);
      await stock.save({ transaction: t });

      await StockMovement.create(
        {
          productId,
          type: "RELEASE",
          quantity: 0,
          reservedDelta: -quantity,
          referenceType: "saleItem",
          referenceId: saleItemId,
          createdBy: userId,
          notes: reason || `Released ${quantity} unit(s) reserved for sale item #${saleItemId}`,
        },
        { transaction: t }
      );
      return;
    }

    // SERIALIZED — the claim itself is just the line's allocatedQuantity (the caller lowers it).
    // Assigned units are only released when the line would otherwise hold more units than it
    // still needs; a line without serials picked yet has nothing to release.
    const item = await SaleItem.findByPk(saleItemId, { transaction: t, lock: true });
    const reservedUnits = await SerialUnit.findAll({
      where: { saleItemId, status: "RESERVED" },
      order: [["id", "DESC"]],
      transaction: t,
      lock: true,
    });
    const heldCount = await SerialUnit.count({
      where: { saleItemId, status: { [Op.in]: ["RESERVED", "SOLD"] } },
      transaction: t,
    });
    const stillNeeded = item ? Math.max(0, expectedSerialCount(item) - quantity) : 0;
    const units = reservedUnits.slice(0, Math.max(0, Math.min(quantity, heldCount - stillNeeded)));
    for (const unit of units) {
      unit.status = "AVAILABLE";
      unit.saleItemId = null;
      await unit.save({ transaction: t });
    }

    await StockMovement.create(
      {
        productId,
        type: "RELEASE",
        quantity: 0,
        reservedDelta: -quantity,
        referenceType: "saleItem",
        referenceId: saleItemId,
        createdBy: userId,
        notes:
          reason ||
          `Released ${quantity} unit(s) reserved for sale item #${saleItemId}${units.length ? ` (serials returned to stock: ${units.map((u) => u.serialNumber).join(", ")})` : ""}`,
      },
      { transaction: t }
    );
  });
};

// Same intent as releaseReservation, but for a reservation that turned out to be defective —
// permanently removes the unit(s) from stock (write-off) instead of returning them to
// available. NON_SERIAL: decrements on-hand quantity, not just reserved. SERIALIZED: marks
// the unit DAMAGED instead of AVAILABLE, keeping saleItemId for audit lineage.
const writeOffReservation = async ({ productId, saleItemId, quantity, userId, reason }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!quantity || quantity <= 0) return;
    const product = await Product.findByPk(productId, { transaction: t });
    assertProduct(product);

    // SOFTWARE and non-inventory (Other / Quick Add) lines never reserve against a Stock row (see
    // reserveStock) — nothing to write off.
    if (product.productType === "SOFTWARE" || isNonInventoryProduct(product)) return;

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      const stock = await Stock.findOne({ where: { productId }, transaction: t, lock: true });
      if (!stock) return;

      stock.reserved = Math.max(0, stock.reserved - quantity);
      stock.quantity = Math.max(0, stock.quantity - quantity);
      await stock.save({ transaction: t });

      await StockMovement.create(
        {
          productId,
          type: "DAMAGE",
          quantity: -quantity,
          reservedDelta: -quantity,
          referenceType: "saleItem",
          referenceId: saleItemId,
          createdBy: userId,
          notes: reason || `Wrote off ${quantity} defective unit(s) reserved for sale item #${saleItemId}`,
        },
        { transaction: t }
      );
      return;
    }

    const units = await SerialUnit.findAll({
      where: { saleItemId, status: "RESERVED" },
      order: [["id", "ASC"]],
      limit: quantity,
      transaction: t,
      lock: true,
    });
    for (const unit of units) {
      unit.status = "DAMAGED";
      unit.notes = reason || unit.notes;
      await unit.save({ transaction: t });
    }

    await StockMovement.create(
      {
        productId,
        type: "DAMAGE",
        quantity: 0,
        reservedDelta: -units.length,
        referenceType: "saleItem",
        referenceId: saleItemId,
        createdBy: userId,
        notes: reason || `Wrote off ${units.length} defective serial unit(s) reserved for sale item #${saleItemId}`,
      },
      { transaction: t }
    );
  });
};

// Converts previously-reserved quantity into an actual shipment/fulfillment. On-hand
// quantity only decreases here, not at reservation time.
const fulfillStock = async ({ productId, saleItemId, quantity, userId, serialNumbers }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!quantity || quantity <= 0) {
      throw new Error("quantity must be positive");
    }
    const product = await Product.findByPk(productId, { transaction: t });
    assertProduct(product);

    let available;
    let serialUnitIds = [];

    if (product.productType === "SOFTWARE" || isNonInventoryProduct(product)) {
      // No Stock/SerialUnit row to touch — "fulfilling" a software or non-inventory (Other /
      // Quick Add) line is purely the shared SaleItem bookkeeping below
      // (fulfilledQuantity/allocatedQuantity/fulfillmentStatus).
      available = null;
    } else if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      const stock = await Stock.findOne({ where: { productId }, transaction: t, lock: true });
      if (!stock || stock.reserved < quantity) {
        throw new Error("Cannot fulfill more than is currently reserved for this order line");
      }

      stock.quantity -= quantity;
      stock.reserved -= quantity;
      await stock.save({ transaction: t });

      await StockMovement.create(
        {
          productId,
          type: "SALE",
          quantity: -quantity,
          reservedDelta: -quantity,
          referenceType: "saleItem",
          referenceId: saleItemId,
          createdBy: userId,
          notes: `Fulfilled ${quantity} unit(s) for sale item #${saleItemId}`,
        },
        { transaction: t }
      );

      available = stock.quantity - stock.reserved;
    } else {
      let units;
      if (serialNumbers && serialNumbers.length) {
        units = await SerialUnit.findAll({
          where: { productId, saleItemId, status: "RESERVED", serialNumber: { [Op.in]: serialNumbers } },
          transaction: t,
          lock: true,
        });
        if (units.length !== quantity) {
          throw new Error("Provided serial numbers do not match the reserved units for this order line");
        }
      } else {
        units = await SerialUnit.findAll({
          where: { productId, saleItemId, status: "RESERVED" },
          order: [["id", "ASC"]],
          limit: quantity,
          transaction: t,
          lock: true,
        });
        // A line may hold fewer units than its quantity — serial selection is optional and a
        // unit can be manually removed from a customer — so ship whatever units are on record.
      }
      for (const unit of units) {
        unit.status = "SOLD";
        unit.soldAt = new Date();
        await unit.save({ transaction: t });
      }
      serialUnitIds = units.map((u) => u.id);

      await StockMovement.create(
        {
          productId,
          type: "SALE",
          quantity: 0,
          reservedDelta: -units.length,
          referenceType: "saleItem",
          referenceId: saleItemId,
          createdBy: userId,
          notes: `Fulfilled ${units.length} serial unit(s) for sale item #${saleItemId}`,
        },
        { transaction: t }
      );

      available = (await getSerialAvailability(productId, { transaction: t })).available;
    }

    const item = await SaleItem.findByPk(saleItemId, { transaction: t, lock: true });
    if (item) {
      item.fulfilledQuantity += quantity;
      item.allocatedQuantity = Math.max(0, item.allocatedQuantity - quantity);
      await item.save({ transaction: t });
      await recomputeItemAndSaleStatus(item, { transaction: t });
    }

    return {
      fulfilled: quantity,
      serialUnitIds,
      available,
      lowStock: available !== null && available <= LOW_STOCK_THRESHOLD,
    };
  });
};

// Units a sale line should hold right now: everything allocated (reserved) or fulfilled (sold),
// less what was already returned. The single definition shared by reassignSerials and the courier
// serials API so the picker's required count and the save-time check can never disagree.
const expectedSerialCount = (item) =>
  Math.max(0, (item.allocatedQuantity || 0) + (item.fulfilledQuantity || 0) - (item.returnedQuantity || 0));

// The only place serial numbers get assigned to a sale line — called from the Courier module's
// save (courier.controller.js#updateCourier), inside that save's transaction, so a failed save
// leaves every unit as it was. Sets the line's assigned units to exactly `serialNumbers`, either
// before fulfillment (units RESERVED) or after (units SOLD, e.g. correcting which physical unit
// actually went out): units dropped from the selection go back to AVAILABLE, newly picked ones
// must be AVAILABLE (row-locked, so a unit can never be assigned to two lines). An empty
// selection unassigns every unit. Assigning or swapping units doesn't change free stock — the
// line's claim is by count (see getUnassignedSerialDemand), so only which unit backs it changes.
const reassignSerials = async ({ saleItemId, productId, serialNumbers, userId }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    // Trim and reject duplicates up front — the same physical unit picked twice would otherwise
    // pass the count check below but only match one row, silently dropping a unit from the line.
    serialNumbers = serialNumbers.map((s) => String(s).trim());
    if (serialNumbers.some((s) => !s) || new Set(serialNumbers).size !== serialNumbers.length) {
      const err = new Error("serialNumbers must be unique, non-empty values");
      err.statusCode = 400;
      throw err;
    }

    const item = await SaleItem.findByPk(saleItemId, { transaction: t, lock: true });
    if (!item) {
      const err = new Error("Order item not found");
      err.statusCode = 404;
      throw err;
    }

    let currentUnits = await SerialUnit.findAll({
      where: { productId, saleItemId, status: "RESERVED" },
      transaction: t,
      lock: true,
    });
    let targetStatus = "RESERVED";
    if (currentUnits.length === 0) {
      currentUnits = await SerialUnit.findAll({
        where: { productId, saleItemId, status: "SOLD" },
        transaction: t,
        lock: true,
      });
      targetStatus = "SOLD";
    }

    const currentNumbers = currentUnits.map((u) => u.serialNumber);
    const unchanged =
      serialNumbers.length === currentNumbers.length && serialNumbers.every((s) => currentNumbers.includes(s));

    // Serial selection is optional: an empty pick means "nothing assigned". Units still linked to
    // the line are released back to AVAILABLE — the line's stock claim is by count, so this never
    // leaves it short. Lines whose units were FIFO-held by older code (serialsManuallySelected
    // === false) already show as "Not Selected" in the picker, so this is what makes the saved
    // state match what the user saw.
    if (serialNumbers.length === 0) {
      if (item.serialsManuallySelected !== false) {
        item.serialsManuallySelected = false;
        await item.save({ transaction: t });
      }
      if (currentUnits.length === 0) return { serialUnitIds: [] };
    } else {
      // A line can hold at most as many serials as it has units allocated or shipped (never its
      // still-backordered part) — anything more would take a unit another sale is counting on.
      const required = expectedSerialCount(item);
      if (required === 0) {
        const err = new Error("This product has no units allocated yet — serial numbers can be picked once it is in stock");
        err.statusCode = 400;
        throw err;
      }
      if (serialNumbers.length > required) {
        const err = new Error(
          `Too many serial numbers selected (${serialNumbers.length}) — this product needs at most ${required}`
        );
        err.statusCode = 400;
        throw err;
      }
      if (currentUnits.length === 0) {
        // Nothing linked at all — new units take on whatever state the line itself is in.
        targetStatus = item.allocatedQuantity > 0 ? "RESERVED" : "SOLD";
      }

      // Any non-empty submission is an explicit user pick, even one matching the held units.
      if (item.serialsManuallySelected !== true) {
        item.serialsManuallySelected = true;
        await item.save({ transaction: t });
      }
      if (unchanged) return { serialUnitIds: currentUnits.map((u) => u.id) };
    }

    const candidates = serialNumbers.length
      ? await SerialUnit.findAll({
          where: { productId, serialNumber: { [Op.in]: serialNumbers } },
          transaction: t,
          lock: true,
        })
      : [];

    const foundNumbers = candidates.map((u) => u.serialNumber);
    const missing = serialNumbers.filter((s) => !foundNumbers.includes(s));
    if (missing.length > 0) {
      const err = new Error(`Serial number(s) not found for this product: ${missing.join(", ")}`);
      err.statusCode = 404;
      throw err;
    }

    // A candidate is fine if it's AVAILABLE, or if it's already ours (part of currentUnits,
    // re-selected as-is) — anything else (reserved/sold for a different line) is a conflict.
    // "Ours" is judged by membership in currentUnits, not by saleItemId alone: a RETURNED/DAMAGED
    // unit keeps its saleItemId for audit lineage but is no longer part of this line.
    const currentIds = new Set(currentUnits.map((u) => u.id));
    const unavailable = candidates.filter((u) => u.status !== "AVAILABLE" && !currentIds.has(u.id));
    if (unavailable.length > 0) {
      const err = new Error(
        `Serial number(s) already reserved/sold, pick a different unit: ${unavailable.map((u) => u.serialNumber).join(", ")}`
      );
      err.statusCode = 409;
      throw err;
    }

    // Only touch the units that actually change hands: release the ones dropped from the
    // selection, claim the ones newly added. Units kept as-is must be left alone — releasing
    // every current unit and then "re-assigning" the kept ones doesn't work, because the
    // candidate instances were loaded before the release and already hold the target
    // status/saleItemId in memory, so Sequelize sees no change and skips the save, leaving the
    // kept units released (AVAILABLE) in the DB and the line short of its serials.
    const keep = new Set(serialNumbers);
    for (const unit of currentUnits) {
      if (keep.has(unit.serialNumber)) continue;
      unit.status = "AVAILABLE";
      unit.saleItemId = null;
      if (targetStatus === "SOLD") unit.soldAt = null;
      await unit.save({ transaction: t });
    }
    for (const unit of candidates) {
      if (currentIds.has(unit.id)) continue;
      unit.status = targetStatus;
      unit.saleItemId = saleItemId;
      if (targetStatus === "SOLD") unit.soldAt = new Date();
      await unit.save({ transaction: t });
    }

    await StockMovement.create(
      {
        productId,
        type: targetStatus === "SOLD" ? "SALE" : "RESERVATION",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "saleItem",
        referenceId: saleItemId,
        createdBy: userId,
        notes: candidates.length
          ? `Assigned ${targetStatus === "SOLD" ? "sold" : "reserved"} serial numbers for sale item #${saleItemId}: ${candidates.map((u) => u.serialNumber).join(", ")}`
          : `Unassigned serial numbers from sale item #${saleItemId}: ${currentNumbers.join(", ")}`,
      },
      { transaction: t }
    );

    return { serialUnitIds: candidates.map((u) => u.id) };
  });
};

// Loads every Courier row sharing a shipmentGroupId together with each row's linked SaleItem.
const loadShipmentGroupRows = async (shipmentGroupId, { transaction } = {}) => {
  const couriers = await Courier.findAll({ where: { shipmentGroupId }, transaction, lock: true });
  const saleItemIds = couriers.map((c) => c.saleItemId).filter(Boolean);
  const items = saleItemIds.length
    ? await SaleItem.findAll({ where: { id: saleItemIds }, transaction, lock: true })
    : [];
  const itemsById = new Map(items.map((i) => [i.id, i]));
  return couriers.map((courier) => ({
    courier,
    item: courier.saleItemId ? itemsById.get(courier.saleItemId) : null,
  }));
};

// A shipment group is "ready" once every member row's underlying SaleItem has nothing left
// backordered — i.e. every product in the group is now fully allocated.
const isShipmentGroupReady = async (shipmentGroupId, { transaction } = {}) => {
  if (!shipmentGroupId) return false;
  const rows = await loadShipmentGroupRows(shipmentGroupId, { transaction });
  if (rows.length === 0) return false;
  return rows.every(({ item }) => item && item.backorderedQuantity === 0);
};

// If every product in the shipment group is now fully allocated, converts each member row's
// outstanding allocation into an actual fulfillment (RESERVED->SOLD / stock decrement — the
// point where inventory is actually committed, deliberately deferred until the whole group is
// ready rather than done item-by-item as stock trickles in) and clears any WAITING_FOR_STOCK
// status back to PENDING. Idempotent: a row whose SaleItem is already fully fulfilled
// (allocatedQuantity === 0) is skipped, so calling this again on an already-fulfilled group is
// a no-op — safe to call speculatively from order creation, the backorder sweep, and a
// shipment-type split.
const tryFulfillReadyGroup = async (shipmentGroupId, { userId, transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!shipmentGroupId) return { becameReady: false, courierIds: [] };

    const rows = await loadShipmentGroupRows(shipmentGroupId, { transaction: t });
    if (rows.length === 0 || !rows.every(({ item }) => item && item.backorderedQuantity === 0)) {
      return { becameReady: false, courierIds: [] };
    }

    const courierIds = [];
    for (const { courier, item } of rows) {
      if (item.allocatedQuantity > 0) {
        await fulfillStock(
          { productId: item.productId, saleItemId: item.id, quantity: item.allocatedQuantity, userId },
          { transaction: t }
        );
      }
      if (courier.status === "WAITING_FOR_STOCK") {
        courier.status = "PENDING";
        courier.pending = true;
        await courier.save({ transaction: t });
      }
      courierIds.push(courier.id);
    }

    return { becameReady: true, courierIds };
  });
};

// New stock arriving. NON_SERIAL takes a quantity + this batch's purchase price/dealer/date.
// SERIALIZED takes an array of individual units, each with its own purchase price/dealer/date.
// Always finishes by sweeping pending backorders for the same product (FIFO by SaleItem
// createdAt/id) so older orders get first claim on newly received stock.
const receiveStock = async (
  { productId, quantity, purchasePrice, dealerId, purchaseDate, notes, units, userId },
  { transaction } = {}
) => {
  return withTransaction(transaction, async (t) => {
    // Locked first (before any non-locking read) — see reserveStock/allocateBackorders.
    const product = await Product.findByPk(productId, { transaction: t, lock: true });
    assertProduct(product);

    if (product.productType === "SOFTWARE") {
      const err = new Error("Receive Stock is not applicable to Software products");
      err.statusCode = 400;
      throw err;
    }

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      if (!quantity || quantity <= 0) {
        throw new Error("quantity must be positive");
      }

      const [stock] = await Stock.findOrCreate({
        where: { productId },
        defaults: { productId, quantity: 0, reserved: 0 },
        transaction: t,
        lock: true,
      });

      stock.quantity += quantity;
      if (purchasePrice !== undefined && purchasePrice !== null) stock.purchasePrice = purchasePrice;
      if (dealerId !== undefined && dealerId !== null) stock.dealerId = dealerId;
      await stock.save({ transaction: t });

      await StockMovement.create(
        {
          productId,
          type: "PURCHASE",
          quantity,
          reservedDelta: 0,
          purchasePrice: purchasePrice ?? null,
          dealerId: dealerId ?? null,
          purchaseDate: purchaseDate ?? null,
          referenceType: "manual",
          referenceId: null,
          createdBy: userId,
          notes: notes || `Received ${quantity} unit(s)`,
        },
        { transaction: t }
      );

      const { allocations, readyShipmentGroupIds } = await allocateBackorders(productId, { transaction: t });
      const available = stock.quantity - stock.reserved;

      return { stock, allocations, readyShipmentGroupIds, available, lowStock: available <= LOW_STOCK_THRESHOLD };
    }

    // SERIALIZED
    if (!units || !Array.isArray(units) || units.length === 0) {
      throw new Error("units must be a non-empty array of { serialNumber, purchasePrice, purchaseDate, dealerId }");
    }

    const created = [];
    for (const u of units) {
      if (!u.serialNumber || !String(u.serialNumber).trim()) {
        throw new Error("Each unit requires a serialNumber");
      }
      const unit = await SerialUnit.create(
        {
          productId,
          serialNumber: String(u.serialNumber).trim(),
          status: "AVAILABLE",
          purchasePrice: u.purchasePrice ?? null,
          sellingPrice: u.sellingPrice ?? null,
          purchaseDate: u.purchaseDate ?? new Date(),
          dealerId: u.dealerId ?? null,
          receivedAt: new Date(),
          createdBy: userId,
        },
        { transaction: t }
      );
      created.push(unit);
    }

    await StockMovement.create(
      {
        productId,
        type: "PURCHASE",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "manual",
        referenceId: null,
        createdBy: userId,
        notes: notes || `Received ${created.length} serial unit(s)`,
      },
      { transaction: t }
    );

    const { allocations, readyShipmentGroupIds } = await allocateBackorders(productId, { transaction: t });
    const { available } = await getSerialAvailability(productId, { transaction: t });

    return { units: created, allocations, readyShipmentGroupIds, available, lowStock: available <= LOW_STOCK_THRESHOLD };
  });
};

// FIFO sweep: allocates currently-available stock to the oldest pending backordered
// SaleItems for this product. Locks all eligible items in one ordered query rather than
// per-row, both for deadlock-safety and to guarantee FIFO fairness.
const allocateBackorders = async (productId, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    // Locked so the SERIALIZED free-stock count below can't race a concurrent reserveStock.
    const product = await Product.findByPk(productId, { transaction: t, lock: true });
    assertProduct(product);

    const items = await SaleItem.findAll({
      where: {
        productId,
        fulfillmentStatus: { [Op.in]: ["BACKORDERED", "PARTIALLY_FULFILLED"] },
        backorderedQuantity: { [Op.gt]: 0 },
      },
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
      transaction: t,
      lock: true,
    });

    const allocations = [];
    const readyShipmentGroupIds = new Set();

    // After an item's allocation changes, re-check whether its linked courier shipment (and the
    // whole shipment group it belongs to, for SHIP_COMPLETE orders) is now ready to fulfill.
    // A sale created with "Create Courier Entry" off has no Courier row at all — such an item
    // isn't part of any shipment group, so it's fulfilled directly the moment it's no longer
    // backordered rather than waiting on group readiness.
    const recheckCourierForItem = async (item) => {
      const courier = await Courier.findOne({ where: { saleItemId: item.id }, transaction: t, lock: true });
      if (!courier) {
        if (item.backorderedQuantity === 0 && item.allocatedQuantity > 0) {
          await fulfillStock(
            { productId: item.productId, saleItemId: item.id, quantity: item.allocatedQuantity, userId: null },
            { transaction: t }
          );
        }
        return;
      }
      if (!courier.shipmentGroupId) return;
      const result = await tryFulfillReadyGroup(courier.shipmentGroupId, { userId: null, transaction: t });
      if (result.becameReady) readyShipmentGroupIds.add(courier.shipmentGroupId);
    };

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      const stock = await Stock.findOne({ where: { productId }, transaction: t, lock: true });
      if (!stock) return { allocations: [], readyShipmentGroupIds: [] };

      for (const item of items) {
        const available = stock.quantity - stock.reserved;
        if (available <= 0) break;

        const toAllocate = Math.min(available, item.backorderedQuantity);
        if (toAllocate <= 0) continue;

        item.backorderedQuantity -= toAllocate;
        item.allocatedQuantity += toAllocate;
        await item.save({ transaction: t });

        stock.reserved += toAllocate;
        await stock.save({ transaction: t });

        await StockMovement.create(
          {
            productId,
            type: "RESERVATION",
            quantity: 0,
            reservedDelta: toAllocate,
            referenceType: "saleItem",
            referenceId: item.id,
            createdBy: null,
            notes: `Backorder FIFO sweep: allocated ${toAllocate} unit(s) to sale item #${item.id}`,
          },
          { transaction: t }
        );

        await recomputeItemAndSaleStatus(item, { transaction: t });
        await recheckCourierForItem(item);
        allocations.push({ saleId: item.saleId, saleItemId: item.id, allocatedQty: toAllocate, serialUnitIds: [] });
      }
      return { allocations, readyShipmentGroupIds: Array.from(readyShipmentGroupIds) };
    }

    // SERIALIZED — count-only, same as reserveStock: newly free units are claimed for the oldest
    // backorders without picking any serial number; those are selected later in Courier.
    let free = (await getSerialAvailability(productId, { transaction: t })).available;
    for (const item of items) {
      if (free <= 0) break;
      const toAllocate = Math.min(free, item.backorderedQuantity);
      if (toAllocate <= 0) continue;
      free -= toAllocate;

      item.backorderedQuantity -= toAllocate;
      item.allocatedQuantity += toAllocate;
      await item.save({ transaction: t });

      await StockMovement.create(
        {
          productId,
          type: "RESERVATION",
          quantity: 0,
          reservedDelta: toAllocate,
          referenceType: "saleItem",
          referenceId: item.id,
          createdBy: null,
          notes: `Backorder FIFO sweep: allocated ${toAllocate} unit(s) to sale item #${item.id} — serial numbers to be selected in Courier`,
        },
        { transaction: t }
      );

      await recomputeItemAndSaleStatus(item, { transaction: t });
      await recheckCourierForItem(item);
      allocations.push({
        saleId: item.saleId,
        saleItemId: item.id,
        allocatedQty: toAllocate,
        serialUnitIds: [],
      });
    }

    return { allocations, readyShipmentGroupIds: Array.from(readyShipmentGroupIds) };
  });
};

// Manual admin adjustment — NON_SERIAL only. SERIALIZED inventory is never adjusted as a
// bare number; use receiveStock (add units) or updateSerialStatus (write off a unit) instead.
const adjustStock = async ({ productId, delta, userId, notes, reason }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (delta === undefined || delta === null || isNaN(delta)) {
      throw new Error("delta must be an integer");
    }
    const product = await Product.findByPk(productId, { transaction: t });
    assertNonSerial(product);

    const [stock] = await Stock.findOrCreate({
      where: { productId },
      defaults: { productId, quantity: 0, reserved: 0 },
      transaction: t,
      lock: true,
    });

    const newQty = stock.quantity + delta;
    if (newQty < 0) {
      throw new Error("Adjustment would make stock negative");
    }
    if (delta < 0 && newQty < stock.reserved) {
      throw new Error("Cannot reduce stock below the quantity already reserved");
    }

    stock.quantity = newQty;
    await stock.save({ transaction: t });

    await StockMovement.create(
      {
        productId,
        type: reason === "DAMAGE" ? "DAMAGE" : "ADJUSTMENT",
        quantity: delta,
        reservedDelta: 0,
        referenceType: "manual",
        referenceId: null,
        createdBy: userId,
        notes: notes || `Manual adjustment: ${delta > 0 ? "+" : ""}${delta}`,
      },
      { transaction: t }
    );

    const available = stock.quantity - stock.reserved;
    return { productId, newQuantity: newQty, available, lowStock: available <= LOW_STOCK_THRESHOLD };
  });
};

// Manual status correction for one serial unit — the inspection step. Two cases:
//  - RETURNED -> AVAILABLE: return accepted, unit re-enters sellable stock.
//  - AVAILABLE/RESERVED/RETURNED -> DAMAGED/LOST: write-off.
// No Stock row to keep in sync — availability is always derived from unit statuses, so
// this is just the status transition plus an audit trail entry.
const updateSerialStatus = async ({ serialUnitId, status, userId, notes }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!["AVAILABLE", "DAMAGED", "LOST"].includes(status)) {
      throw new Error("status must be AVAILABLE, DAMAGED, or LOST");
    }
    const unit = await SerialUnit.findByPk(serialUnitId, { transaction: t, lock: true });
    if (!unit) throw new Error("Serial unit not found");

    const fromStatus = unit.status;
    unit.status = status;
    unit.notes = notes || unit.notes;
    await unit.save({ transaction: t });

    await StockMovement.create(
      {
        productId: unit.productId,
        type: status === "AVAILABLE" ? "RETURN" : "DAMAGE",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "serialUnit",
        referenceId: unit.id,
        createdBy: userId,
        notes: notes || `Serial ${unit.serialNumber}: ${fromStatus} -> ${status}`,
      },
      { transaction: t }
    );

    return unit;
  });
};

// Units tied to a sale — their serial number is what the invoice/income entry shows, and their
// selling price is read from the SaleItem, so only purchase provenance stays editable on them.
const SALE_LINKED_SERIAL_STATUSES = ["RESERVED", "SOLD"];

const SERIAL_STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "RETURNED", "DAMAGED", "LOST"];

// Sale lines of a SERIALIZED product a unit can be manually assigned to (its "customer"):
// every line of a non-cancelled sale, with how many units it holds vs. how many it should.
const getAssignableSaleLines = async (productId, { transaction } = {}) => {
  const items = await SaleItem.findAll({
    where: { productId, fulfillmentStatus: { [Op.ne]: "CANCELLED" } },
    include: [{ model: Sale, attributes: ["id", "invoiceNumber", "customerName", "status"], where: { status: { [Op.ne]: "CANCELLED" } } }],
    order: [["id", "DESC"]],
    transaction,
  });
  const held = items.length
    ? await SerialUnit.findAll({
        where: { saleItemId: items.map((i) => i.id), status: { [Op.in]: SALE_LINKED_SERIAL_STATUSES } },
        attributes: ["saleItemId"],
        transaction,
      })
    : [];
  return items.map((i) => ({
    saleItemId: i.id,
    saleId: i.saleId,
    invoiceNumber: i.Sale?.invoiceNumber || null,
    customerName: i.Sale?.customerName || null,
    quantity: i.quantity,
    requiredCount: expectedSerialCount(i),
    heldCount: held.filter((u) => u.saleItemId === i.id).length,
  }));
};

// Manual correction of which customer (sale line) a unit belongs to and its status — e.g.
// removing a unit from a customer, moving it to another customer's sale, or fixing a status.
// RESERVED/SOLD need a sale line; AVAILABLE never has one; RETURNED/DAMAGED/LOST may keep one
// for lineage. A line can never hold more units than its quantity: moving a unit into a full
// line swaps out one of its FIFO-held (never user-picked) units, otherwise the request is
// refused. This only changes which unit is on record — the line's allocated/fulfilled
// quantities are untouched, so a line left short of units just shows "Not Selected".
const applySerialAssignment = async (unit, { status, saleItemId, userId }, { transaction: t }) => {
  if (!SERIAL_STATUSES.includes(status)) {
    const err = new Error(`status must be one of ${SERIAL_STATUSES.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
  const targetItemId = status === "AVAILABLE" ? null : saleItemId ? Number(saleItemId) : null;
  if (SALE_LINKED_SERIAL_STATUSES.includes(status) && !targetItemId) {
    const err = new Error(`A ${status} unit must be assigned to a customer's sale`);
    err.statusCode = 400;
    throw err;
  }

  const fromStatus = unit.status;
  const fromItemId = unit.saleItemId;
  if (fromStatus === status && (fromItemId || null) === targetItemId) return null;

  if (targetItemId) {
    const item = await SaleItem.findByPk(targetItemId, {
      include: [{ model: Sale, attributes: ["id", "invoiceNumber", "customerName", "status"] }],
      transaction: t,
      lock: true,
    });
    if (!item || item.productId !== unit.productId) {
      const err = new Error("Selected sale does not contain this product");
      err.statusCode = 400;
      throw err;
    }
    if (item.fulfillmentStatus === "CANCELLED" || item.Sale?.status === "CANCELLED") {
      const err = new Error("Cannot assign a serial unit to a cancelled sale");
      err.statusCode = 400;
      throw err;
    }

    const joiningLine = SALE_LINKED_SERIAL_STATUSES.includes(status) &&
      !(SALE_LINKED_SERIAL_STATUSES.includes(fromStatus) && fromItemId === item.id);
    if (joiningLine) {
      const others = await SerialUnit.findAll({
        where: { saleItemId: item.id, status: { [Op.in]: SALE_LINKED_SERIAL_STATUSES }, id: { [Op.ne]: unit.id } },
        order: [["id", "DESC"]],
        transaction: t,
        lock: true,
      });
      const required = expectedSerialCount(item);
      if (required === 0) {
        const err = new Error("This sale has no units allocated for this product yet — it is still backordered");
        err.statusCode = 400;
        throw err;
      }
      if (others.length >= required) {
        if (item.serialsManuallySelected !== false) {
          const err = new Error(
            `${item.Sale?.customerName || "This sale"} already has all ${required} serial number(s) for this product — remove one first`
          );
          err.statusCode = 409;
          throw err;
        }
        // FIFO-held placeholders — release just enough to make room for the explicit pick.
        for (const extra of others.slice(0, others.length - required + 1)) {
          extra.status = "AVAILABLE";
          extra.saleItemId = null;
          extra.soldAt = null;
          await extra.save({ transaction: t });
        }
      }
      if (item.serialsManuallySelected !== true) {
        item.serialsManuallySelected = true;
        await item.save({ transaction: t });
      }
    }
  }

  unit.status = status;
  unit.saleItemId = targetItemId;
  if (status === "SOLD") unit.soldAt = unit.soldAt || new Date();
  else if (status === "AVAILABLE" || status === "RESERVED") unit.soldAt = null;
  if (status === "RETURNED") unit.returnedAt = unit.returnedAt || new Date();
  await unit.save({ transaction: t });

  await StockMovement.create(
    {
      productId: unit.productId,
      type: "ADJUSTMENT",
      quantity: 0,
      reservedDelta: 0,
      referenceType: "serialUnit",
      referenceId: unit.id,
      createdBy: userId,
      notes: `Serial ${unit.serialNumber}: ${fromStatus}${fromItemId ? ` (sale item #${fromItemId})` : ""} -> ${status}${targetItemId ? ` (sale item #${targetItemId})` : ""}`,
    },
    { transaction: t }
  );
  return unit;
};

// Manual correction of one unit's details (typo in serial number, wrong purchase price, etc.),
// optionally together with its status/assigned customer (see applySerialAssignment).
const updateSerialUnit = async (
  { serialUnitId, serialNumber, purchasePrice, sellingPrice, purchaseDate, dealerId, status, saleItemId, userId },
  { transaction } = {}
) => {
  return withTransaction(transaction, async (t) => {
    const unit = await SerialUnit.findByPk(serialUnitId, { transaction: t, lock: true });
    if (!unit) throw new Error("Serial unit not found");

    if (status !== undefined) {
      await applySerialAssignment(unit, { status, saleItemId, userId }, { transaction: t });
    }

    const isSaleLinked = SALE_LINKED_SERIAL_STATUSES.includes(unit.status);
    const changes = [];

    if (serialNumber !== undefined) {
      const trimmed = String(serialNumber || "").trim();
      if (!trimmed) throw new Error("Serial number is required");
      if (trimmed !== unit.serialNumber) {
        if (isSaleLinked) {
          throw new Error(`Serial number cannot be changed on a ${unit.status} unit`);
        }
        changes.push(`serial ${unit.serialNumber} -> ${trimmed}`);
        unit.serialNumber = trimmed;
      }
    }
    if (sellingPrice !== undefined) {
      if (isSaleLinked) {
        throw new Error(`Selling price cannot be changed on a ${unit.status} unit`);
      }
      unit.sellingPrice = sellingPrice === "" ? null : sellingPrice;
    }
    if (purchasePrice !== undefined) unit.purchasePrice = purchasePrice === "" ? null : purchasePrice;
    if (purchaseDate !== undefined) unit.purchaseDate = purchaseDate || null;
    if (dealerId !== undefined) unit.dealerId = dealerId || null;

    await unit.save({ transaction: t });

    await StockMovement.create(
      {
        productId: unit.productId,
        type: "ADJUSTMENT",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "serialUnit",
        referenceId: unit.id,
        createdBy: userId,
        notes: `Serial ${unit.serialNumber} details edited${changes.length ? `: ${changes.join(", ")}` : ""}`,
      },
      { transaction: t }
    );

    return unit;
  });
};

// Removes a unit entered by mistake. Units that were ever part of a sale (RESERVED/SOLD, or
// RETURNED which keeps saleItemId for audit lineage) are refused — write those off instead.
const deleteSerialUnit = async ({ serialUnitId, userId }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const unit = await SerialUnit.findByPk(serialUnitId, { transaction: t, lock: true });
    if (!unit) throw new Error("Serial unit not found");

    if ([...SALE_LINKED_SERIAL_STATUSES, "RETURNED"].includes(unit.status)) {
      const err = new Error(`A ${unit.status} serial unit cannot be deleted`);
      err.statusCode = 400;
      throw err;
    }

    const { id, productId, serialNumber } = unit;
    await unit.destroy({ transaction: t });

    await StockMovement.create(
      {
        productId,
        type: "ADJUSTMENT",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "serialUnit",
        referenceId: id,
        createdBy: userId,
        notes: `Serial ${serialNumber} deleted`,
      },
      { transaction: t }
    );

    return { id };
  });
};

module.exports = {
  LOW_STOCK_THRESHOLD,
  STOCK_TRACKED_TYPES,
  getOrCreateStock,
  getSerialAvailability,
  getUnassignedSerialDemand,
  reserveStock,
  releaseReservation,
  writeOffReservation,
  fulfillStock,
  reassignSerials,
  expectedSerialCount,
  isShipmentGroupReady,
  tryFulfillReadyGroup,
  receiveStock,
  allocateBackorders,
  adjustStock,
  updateSerialStatus,
  getAssignableSaleLines,
  updateSerialUnit,
  deleteSerialUnit,
  recomputeSaleFulfillmentStatus,
  computeItemFulfillmentStatus,
  isNonInventoryProduct,
};
