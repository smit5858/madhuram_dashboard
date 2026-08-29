const { Courier, User, Sale, SaleItem } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { notify } = require("../services/notification.service");
const inventoryService = require("../services/inventory.service");

const COURIER_STATUSES = ["PENDING", "WAITING_FOR_STOCK", "IN_PROGRESS", "OUT_FOR_DELIVERY", "DONE"];
const STATUS_RANK = { PENDING: 0, WAITING_FOR_STOCK: 1, IN_PROGRESS: 2, OUT_FOR_DELIVERY: 3, DONE: 4 };

// Included on list/detail reads so the frontend can show per-product availability
// (allocated/fulfilled/backordered) and derive shipment/product status without a second call.
const SALE_ITEM_INCLUDE = {
  model: SaleItem,
  attributes: ["id", "quantity", "allocatedQuantity", "fulfilledQuantity", "backorderedQuantity", "fulfillmentStatus"],
};
const SALE_INCLUDE = { model: Sale, attributes: ["id", "invoiceNumber", "customerName"] };

/**
 * Build a where-clause for city-scoped access.
 * - Admin: no restriction (returns {})
 * - Non-Admin with allowedCity: filter courier.city = allowedCity
 * - Non-Admin without allowedCity: fall back to userId ownership filter
 */
const buildScopeWhere = async (jwtUser) => {
  if (jwtUser.roleName === "Admin") {
    return {};
  }

  // Load the full user record to get allowedCity
  const userRecord = await User.findByPk(jwtUser.id, {
    attributes: ["id", "allowedCity"],
  });

  if (userRecord && userRecord.allowedCity) {
    return { city: userRecord.allowedCity };
  }

  // Fallback: scope by userId (original behaviour)
  return { userId: jwtUser.id };
};

/**
 * Verify that a given courier record is within the authenticated user's allowed scope.
 * Returns true if access is allowed.
 */
const verifyScope = async (courier, jwtUser) => {
  if (jwtUser.roleName === "Admin") return true;

  const userRecord = await User.findByPk(jwtUser.id, {
    attributes: ["id", "allowedCity"],
  });

  if (userRecord && userRecord.allowedCity) {
    return courier.city === userRecord.allowedCity;
  }

  // Fallback: ownership check
  return courier.userId === jwtUser.id;
};

// GET /couriers
exports.getCouriers = async (req, res) => {
  try {
    const user = req.user;
    const scopeWhere = await buildScopeWhere(user);

    // Optional Product Name filter (applies server-side alongside scope)
    if (req.query.productName) {
      scopeWhere.productName = { [Op.like]: `%${req.query.productName}%` };
    }

    // Optional saleId filter — lets the frontend fetch every sibling shipment for one sale
    // (covers both groups after a shipment-type split) with the same list endpoint.
    if (req.query.saleId) {
      scopeWhere.saleId = req.query.saleId;
    }

    // Optional direction filter (IN = inbound to us, OUT = outbound to customer)
    if (req.query.direction === "IN" || req.query.direction === "OUT") {
      scopeWhere.direction = req.query.direction;
    }

    const couriers = await Courier.findAll({
      where: scopeWhere,
      include: [
        { model: User, attributes: ["id", "name", "email"] },
        SALE_ITEM_INCLUDE,
        SALE_INCLUDE,
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: couriers,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /couriers/:id
exports.getCourierById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id, {
      include: [
        { model: User, attributes: ["id", "name", "email"] },
        SALE_ITEM_INCLUDE,
        SALE_INCLUDE,
      ],
    });

    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Backend enforces scope — frontend cannot bypass this
    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    return res.status(200).json({ success: true, data: courier });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /couriers — manual (non-sale) entries only; sale-linked rows are always created by
// orderService.createOrder, never through this endpoint.
exports.createCourier = async (req, res) => {
  try {
    const user = req.user;
    const {
      name, email, phone,
      customerName, address, city, mobileNo, pincode,
      productName, charge, freePickup,
      courierName, trackId, kg, note, entryDate, quantity,
      direction,
    } = req.body || {};

    if (direction !== undefined && direction !== "IN" && direction !== "OUT") {
      return res.status(400).json({ success: false, message: "direction must be either \"IN\" or \"OUT\"" });
    }

    // For non-Admin, enforce city from their allowedCity
    let targetCity = city;
    if (user.roleName !== "Admin") {
      const userRecord = await User.findByPk(user.id, { attributes: ["allowedCity"] });
      if (userRecord && userRecord.allowedCity) {
        targetCity = userRecord.allowedCity; // non-admin cannot create outside their city
      }
    }

    const courier = await Courier.create({
      name: name || customerName || null,
      email: email || null,
      phone: phone || mobileNo || null,
      customerName: customerName || name || null,
      address: address || null,
      city: targetCity || null,
      pincode: pincode || null,
      mobileNo: mobileNo || phone || null,
      productName: productName || null,
      charge: charge !== undefined ? charge : null,
      freePickup: freePickup !== undefined ? freePickup : false,
      courierName: courierName || null,
      trackId: trackId || null,
      kg: kg !== undefined ? kg : null,
      // Initial status is always Pending — never trust a client-supplied status here.
      status: "PENDING",
      pending: true,
      note: note || null,
      completedDate: null,
      entryDate: entryDate || null,
      quantity: quantity !== undefined && quantity !== "" ? quantity : null,
      direction: direction || "OUT",
      // Owner is always the creator — there's no manual "assign owner" path any more.
      userId: user.id,
    });

    return res.status(201).json({
      success: true,
      message: "Courier created successfully",
      data: courier,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /couriers/:id
exports.updateCourier = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;
    const {
      name, email, phone,
      customerName, address, city, mobileNo, pincode,
      productName, charge, freePickup,
      courierName, trackId, kg, note, entryDate, quantity,
      status, serialNumbers, direction,
    } = req.body || {};

    if (direction !== undefined && direction !== "IN" && direction !== "OUT") {
      await t.rollback();
      return res.status(400).json({ success: false, message: "direction must be either \"IN\" or \"OUT\"" });
    }

    if (status !== undefined && !COURIER_STATUSES.includes(status)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `status must be one of: ${COURIER_STATUSES.join(", ")}` });
    }
    if (status === "WAITING_FOR_STOCK") {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "status \"WAITING_FOR_STOCK\" is system-managed and cannot be set directly" });
    }

    const courier = await Courier.findByPk(id, { transaction: t, lock: true });
    if (!courier) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Backend enforces scope
    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    // Update fields — only override if provided
    if (customerName !== undefined) courier.customerName = customerName;
    if (name !== undefined) courier.name = name;
    if (email !== undefined) courier.email = email;
    if (phone !== undefined) courier.phone = phone;
    if (address !== undefined) courier.address = address;
    if (mobileNo !== undefined) courier.mobileNo = mobileNo;
    if (pincode !== undefined) courier.pincode = pincode;
    if (productName !== undefined) courier.productName = productName;
    if (charge !== undefined) courier.charge = charge;
    if (freePickup !== undefined) courier.freePickup = freePickup;
    if (courierName !== undefined) courier.courierName = courierName;
    if (trackId !== undefined) courier.trackId = trackId;
    if (kg !== undefined) courier.kg = kg;
    if (note !== undefined) courier.note = note;
    if (entryDate !== undefined) courier.entryDate = entryDate;
    if (quantity !== undefined) courier.quantity = quantity !== "" ? quantity : null;
    if (direction !== undefined) courier.direction = direction;

    // City: Admin can update city; non-Admin city is locked to their allowedCity
    if (user.roleName === "Admin") {
      if (city !== undefined) courier.city = city;
    }

    // Status pipeline: Pending -> Waiting for Stock -> In Progress -> Out for Delivery -> Done.
    // Waiting for Stock is only ever entered/left automatically (see inventory.service.js's
    // tryFulfillReadyGroup) — a courier stuck there can't be manually advanced until the whole
    // shipment group is ready, and non-Admin cannot move a courier backward (only Admin can
    // correct mistakes).
    const previousStatus = courier.status;
    if (status !== undefined && status !== previousStatus) {
      if (previousStatus === "WAITING_FOR_STOCK") {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "This shipment is waiting for stock and will become available for processing automatically once every product in it is in stock.",
        });
      }
      if (user.roleName !== "Admin" && STATUS_RANK[status] < STATUS_RANK[previousStatus]) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Cannot move a courier status backward" });
      }
      courier.status = status;
    }
    courier.pending = courier.status !== "DONE";

    // Auto-stamp the delivered date the moment a courier reaches Done — there's no manual
    // "Delivered Date" field on the edit form any more.
    if (previousStatus !== "DONE" && courier.status === "DONE" && !courier.completedDate) {
      courier.completedDate = new Date().toISOString().slice(0, 10);
    }

    // Serial numbers can only be re-picked before this shipment has been fulfilled.
    if (Array.isArray(serialNumbers) && serialNumbers.length > 0 && courier.saleItemId) {
      const saleItem = await SaleItem.findByPk(courier.saleItemId, { transaction: t, lock: true });
      if (saleItem) {
        await inventoryService.reassignSerials(
          { saleItemId: saleItem.id, productId: saleItem.productId, serialNumbers, userId: user.id },
          { transaction: t }
        );
      }
    }

    await courier.save({ transaction: t });

    await t.commit();

    // Notify the salesperson who created the linked sale when it's marked Done.
    if (previousStatus !== "DONE" && courier.status === "DONE" && courier.saleId) {
      const sale = await Sale.findByPk(courier.saleId, { attributes: ["id", "invoiceNumber", "customerName", "createdBy"] });
      if (sale && sale.createdBy) {
        await notify([
          {
            recipientModule: "account", // Notification.recipientModule is required; ignored once recipientUserId targets a specific user
            recipientUserId: sale.createdBy,
            type: "ORDER_FULFILLED",
            title: "Order Delivered",
            message: `Invoice ${sale.invoiceNumber}: ${courier.productName || "order"} for ${sale.customerName} marked Done by the courier team.`,
            referenceType: "sale",
            referenceId: sale.id,
            event: "order_delivered",
            payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber }, courierId: courier.id },
          },
        ]);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Courier updated successfully",
      data: courier,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// PUT /couriers/:id/shipment-type — Ship Complete Order vs Ship Available Products. Acts on the
// whole shipment group the given courier belongs to, not just the one row.
exports.updateShipmentType = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;
    const { shipmentType } = req.body || {};

    if (shipmentType !== "SHIP_COMPLETE" && shipmentType !== "SHIP_AVAILABLE") {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "shipmentType must be either \"SHIP_COMPLETE\" or \"SHIP_AVAILABLE\"" });
    }

    const courier = await Courier.findByPk(id, { transaction: t, lock: true });
    if (!courier) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    if (!courier.shipmentGroupId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "This courier record has no shipment group to change" });
    }

    if (courier.shipmentType === shipmentType) {
      await t.commit();
      return res.status(200).json({ success: true, message: "Shipment type unchanged", data: [courier] });
    }

    const groupRows = await Courier.findAll({
      where: { shipmentGroupId: courier.shipmentGroupId },
      transaction: t,
      lock: true,
    });

    const waitingRank = STATUS_RANK.WAITING_FOR_STOCK;
    const alreadyProgressed = groupRows.some((c) => STATUS_RANK[c.status] > waitingRank);
    if (alreadyProgressed) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Cannot change shipment type — this shipment has already started processing" });
    }

    const saleItemIds = groupRows.map((c) => c.saleItemId).filter(Boolean);
    const saleItems = saleItemIds.length
      ? await SaleItem.findAll({ where: { id: saleItemIds }, transaction: t, lock: true })
      : [];
    const itemsById = new Map(saleItems.map((i) => [i.id, i]));

    if (shipmentType === "SHIP_COMPLETE") {
      // Merging back to "wait for everything" — just relabel the group, no row movement needed.
      for (const c of groupRows) {
        c.shipmentType = "SHIP_COMPLETE";
        await c.save({ transaction: t });
      }
      await t.commit();
      const updated = await Courier.findAll({ where: { shipmentGroupId: courier.shipmentGroupId } });
      return res.status(200).json({ success: true, message: "Shipment type updated", data: updated });
    }

    // shipmentType === "SHIP_AVAILABLE"
    const isRowReady = (c) => {
      const item = c.saleItemId ? itemsById.get(c.saleItemId) : null;
      return !item || item.backorderedQuantity === 0;
    };
    const allReady = groupRows.every(isRowReady);

    if (allReady) {
      for (const c of groupRows) {
        c.shipmentType = "SHIP_AVAILABLE";
        await c.save({ transaction: t });
      }
      await inventoryService.tryFulfillReadyGroup(courier.shipmentGroupId, { userId: user.id, transaction: t });
      await t.commit();
      const updated = await Courier.findAll({ where: { shipmentGroupId: courier.shipmentGroupId } });
      return res.status(200).json({ success: true, message: "Shipment type updated", data: updated });
    }

    // Mixed availability — split into two new groups, computing the next unused letter suffix
    // per saleId so re-splitting a remainder later can't collide with an earlier split.
    const existingGroups = await Courier.findAll({
      where: { saleId: courier.saleId },
      attributes: ["shipmentGroupId"],
      transaction: t,
    });
    const basePrefix = `SALE-${courier.saleId}`;
    const usedSuffixes = new Set(
      existingGroups.map((c) => c.shipmentGroupId).filter(Boolean).map((g) => g.slice(basePrefix.length))
    );
    const nextSuffix = () => {
      for (let i = 0; i < 26; i++) {
        const suffix = `-${String.fromCharCode(65 + i)}`;
        if (!usedSuffixes.has(suffix)) {
          usedSuffixes.add(suffix);
          return suffix;
        }
      }
      throw new Error("Ran out of shipment group letters for this sale");
    };

    const availableGroupId = `${basePrefix}${nextSuffix()}`;
    const waitingGroupId = `${basePrefix}${nextSuffix()}`;

    for (const c of groupRows) {
      const ready = isRowReady(c);
      c.shipmentGroupId = ready ? availableGroupId : waitingGroupId;
      c.shipmentType = ready ? "SHIP_AVAILABLE" : "SHIP_COMPLETE";
      c.status = ready ? "PENDING" : "WAITING_FOR_STOCK";
      c.pending = true;
      await c.save({ transaction: t });
    }

    await inventoryService.tryFulfillReadyGroup(availableGroupId, { userId: user.id, transaction: t });

    await t.commit();

    const updated = await Courier.findAll({ where: { shipmentGroupId: { [Op.in]: [availableGroupId, waitingGroupId] } } });
    return res.status(200).json({ success: true, message: "Shipment split into available and waiting entries", data: updated });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /couriers/:id
exports.deleteCourier = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id);
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Backend enforces scope
    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    await courier.destroy();

    return res.status(200).json({
      success: true,
      message: "Courier deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
