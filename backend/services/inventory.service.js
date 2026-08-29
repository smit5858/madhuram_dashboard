const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Product, Stock, StockMovement, SerialUnit, SaleItem, Sale, Courier } = require("../models");

// No per-product threshold field exists yet — a single constant is enough for now,
// trivial to promote to a Product column later if the business wants it configurable.
const LOW_STOCK_THRESHOLD = 5;

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

// Stock (quantity/reserved) only exists for NON_SERIAL products — SERIALIZED availability
// is always derived from serial_units, never from a stored counter. Callers that only make
// sense against a Stock row (manual quantity adjustment) must use this instead of assertProduct.
const assertNonSerial = (product) => {
  assertProduct(product);
  if (product.productType !== "NON_SERIAL") {
    const err = new Error(
      "This operation is only available for NON_SERIAL products — use serial unit receive/inspect operations instead"
    );
    err.statusCode = 400;
    throw err;
  }
};

// SERIALIZED availability/reserved/sold, derived on read from serial_units — the sole
// source of truth for SERIALIZED products. No counter to keep in sync, nothing to drift.
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
  return {
    available: counts.AVAILABLE,
    reserved: counts.RESERVED,
    sold: counts.SOLD,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  };
};

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
// For SERIALIZED products, an explicit `serialNumbers` list picks exact units (the sales-flow
// serial picker) instead of FIFO — this is all-or-nothing: any requested serial that's missing
// or no longer AVAILABLE fails the whole reservation, so a unit can never be double-sold.
const reserveStock = async ({ productId, saleItemId, quantity, userId, serialNumbers }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    const product = await Product.findByPk(productId, { transaction: t });
    assertProduct(product);

    if (product.productType === "NON_SERIAL") {
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

    let units;
    if (serialNumbers && serialNumbers.length > 0) {
      if (serialNumbers.length !== quantity) {
        const err = new Error("Number of selected serial numbers must match the quantity");
        err.statusCode = 400;
        throw err;
      }

      // Lock every matching row for this product regardless of status, so we can tell a
      // "not found" serial apart from one that's simply no longer AVAILABLE.
      units = await SerialUnit.findAll({
        where: { productId, serialNumber: { [Op.in]: serialNumbers } },
        transaction: t,
        lock: true,
      });

      const foundNumbers = units.map((u) => u.serialNumber);
      const missing = serialNumbers.filter((s) => !foundNumbers.includes(s));
      if (missing.length > 0) {
        const err = new Error(`Serial number(s) not found for this product: ${missing.join(", ")}`);
        err.statusCode = 404;
        throw err;
      }

      const unavailable = units.filter((u) => u.status !== "AVAILABLE");
      if (unavailable.length > 0) {
        const err = new Error(
          `Serial number(s) already reserved/sold, pick a different unit: ${unavailable.map((u) => u.serialNumber).join(", ")}`
        );
        err.statusCode = 409;
        throw err;
      }
    } else {
      // SERIALIZED — lock and claim up to `quantity` AVAILABLE units directly. The row-level
      // FOR UPDATE lock on the selected units is what prevents double-allocation under
      // concurrency; there is no Stock row to lock instead.
      units = await SerialUnit.findAll({
        where: { productId, status: "AVAILABLE" },
        order: [["id", "ASC"]],
        limit: quantity,
        transaction: t,
        lock: true,
      });
    }

    for (const unit of units) {
      unit.status = "RESERVED";
      unit.saleItemId = saleItemId;
      await unit.save({ transaction: t });
    }

    const allocated = units.length;
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
          notes: `Reserved ${allocated} serial unit(s) for sale item #${saleItemId}`,
        },
        { transaction: t }
      );
    }

    const { available } = await getSerialAvailability(productId, { transaction: t });
    return { allocated, backordered, serialUnitIds: units.map((u) => u.id), available };
  });
};

// Releases a previously-reserved (not yet fulfilled) quantity back to available stock.
const releaseReservation = async ({ productId, saleItemId, quantity, userId, reason }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!quantity || quantity <= 0) return;
    const product = await Product.findByPk(productId, { transaction: t });
    assertProduct(product);

    if (product.productType === "NON_SERIAL") {
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

    const units = await SerialUnit.findAll({
      where: { saleItemId, status: "RESERVED" },
      order: [["id", "ASC"]],
      limit: quantity,
      transaction: t,
      lock: true,
    });
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
        reservedDelta: -units.length,
        referenceType: "saleItem",
        referenceId: saleItemId,
        createdBy: userId,
        notes: reason || `Released ${units.length} serial unit(s) reserved for sale item #${saleItemId}`,
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

    if (product.productType === "NON_SERIAL") {
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

    if (product.productType === "NON_SERIAL") {
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
        if (units.length < quantity) {
          throw new Error("Not enough reserved serial units to fulfill this quantity");
        }
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

    return { fulfilled: quantity, serialUnitIds, available, lowStock: available <= LOW_STOCK_THRESHOLD };
  });
};

// Re-picks the serial numbers reserved for a courier's line item, before it has been
// fulfilled (units still RESERVED, not yet SOLD). Releases the units currently held for this
// saleItemId and reserves the newly chosen ones, validating count and AVAILABLE status the same
// way reserveStock's explicit-serials path does, so a unit can never be double-assigned.
const reassignSerials = async ({ saleItemId, productId, serialNumbers, userId }, { transaction } = {}) => {
  return withTransaction(transaction, async (t) => {
    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      const err = new Error("serialNumbers must be a non-empty array");
      err.statusCode = 400;
      throw err;
    }

    const item = await SaleItem.findByPk(saleItemId, { transaction: t, lock: true });
    if (!item) {
      const err = new Error("Order item not found");
      err.statusCode = 404;
      throw err;
    }

    const currentlyReserved = await SerialUnit.findAll({
      where: { productId, saleItemId, status: "RESERVED" },
      transaction: t,
      lock: true,
    });
    if (currentlyReserved.length !== item.allocatedQuantity) {
      const err = new Error("Serial numbers can only be reassigned before this shipment has been fulfilled");
      err.statusCode = 400;
      throw err;
    }
    if (serialNumbers.length !== currentlyReserved.length) {
      const err = new Error(
        `Number of selected serial numbers (${serialNumbers.length}) must match the reserved quantity (${currentlyReserved.length})`
      );
      err.statusCode = 400;
      throw err;
    }

    const currentNumbers = currentlyReserved.map((u) => u.serialNumber);
    const unchanged =
      serialNumbers.length === currentNumbers.length && serialNumbers.every((s) => currentNumbers.includes(s));
    if (unchanged) {
      return { serialUnitIds: currentlyReserved.map((u) => u.id) };
    }

    const candidates = await SerialUnit.findAll({
      where: { productId, serialNumber: { [Op.in]: serialNumbers } },
      transaction: t,
      lock: true,
    });

    const foundNumbers = candidates.map((u) => u.serialNumber);
    const missing = serialNumbers.filter((s) => !foundNumbers.includes(s));
    if (missing.length > 0) {
      const err = new Error(`Serial number(s) not found for this product: ${missing.join(", ")}`);
      err.statusCode = 404;
      throw err;
    }

    // A candidate is fine if it's AVAILABLE, or if it's already ours (part of currentlyReserved,
    // re-selected as-is) — anything else (reserved/sold for a different line) is a conflict.
    const unavailable = candidates.filter((u) => u.status !== "AVAILABLE" && u.saleItemId !== saleItemId);
    if (unavailable.length > 0) {
      const err = new Error(
        `Serial number(s) already reserved/sold, pick a different unit: ${unavailable.map((u) => u.serialNumber).join(", ")}`
      );
      err.statusCode = 409;
      throw err;
    }

    for (const unit of currentlyReserved) {
      unit.status = "AVAILABLE";
      unit.saleItemId = null;
      await unit.save({ transaction: t });
    }
    for (const unit of candidates) {
      unit.status = "RESERVED";
      unit.saleItemId = saleItemId;
      await unit.save({ transaction: t });
    }

    await StockMovement.create(
      {
        productId,
        type: "RESERVATION",
        quantity: 0,
        reservedDelta: 0,
        referenceType: "saleItem",
        referenceId: saleItemId,
        createdBy: userId,
        notes: `Reassigned serial numbers for sale item #${saleItemId}: ${candidates.map((u) => u.serialNumber).join(", ")}`,
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
    const product = await Product.findByPk(productId, { transaction: t });
    assertProduct(product);

    if (product.productType === "NON_SERIAL") {
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
          purchaseDate: u.purchaseDate ?? null,
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
    const product = await Product.findByPk(productId, { transaction: t });
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
    const recheckCourierForItem = async (item) => {
      const courier = await Courier.findOne({ where: { saleItemId: item.id }, transaction: t, lock: true });
      if (!courier || !courier.shipmentGroupId) return;
      const result = await tryFulfillReadyGroup(courier.shipmentGroupId, { userId: null, transaction: t });
      if (result.becameReady) readyShipmentGroupIds.add(courier.shipmentGroupId);
    };

    if (product.productType === "NON_SERIAL") {
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

    // SERIALIZED
    for (const item of items) {
      const units = await SerialUnit.findAll({
        where: { productId, status: "AVAILABLE" },
        order: [["id", "ASC"]],
        limit: item.backorderedQuantity,
        transaction: t,
        lock: true,
      });
      if (units.length === 0) break;

      for (const unit of units) {
        unit.status = "RESERVED";
        unit.saleItemId = item.id;
        await unit.save({ transaction: t });
      }

      const toAllocate = units.length;
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
          notes: `Backorder FIFO sweep: allocated ${toAllocate} serial unit(s) to sale item #${item.id}`,
        },
        { transaction: t }
      );

      await recomputeItemAndSaleStatus(item, { transaction: t });
      await recheckCourierForItem(item);
      allocations.push({
        saleId: item.saleId,
        saleItemId: item.id,
        allocatedQty: toAllocate,
        serialUnitIds: units.map((u) => u.id),
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

module.exports = {
  LOW_STOCK_THRESHOLD,
  getOrCreateStock,
  getSerialAvailability,
  reserveStock,
  releaseReservation,
  writeOffReservation,
  fulfillStock,
  reassignSerials,
  isShipmentGroupReady,
  tryFulfillReadyGroup,
  receiveStock,
  allocateBackorders,
  adjustStock,
  updateSerialStatus,
  recomputeSaleFulfillmentStatus,
  computeItemFulfillmentStatus,
};
