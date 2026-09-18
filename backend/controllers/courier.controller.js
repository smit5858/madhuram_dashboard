const { Courier, User, Sale, SaleItem, SerialUnit, AccountEntry } = require("../models");
const { Op } = require("sequelize");
const dayjs = require("dayjs");
const sequelize = require("../config/db");
const { notify } = require("../services/notification.service");
const inventoryService = require("../services/inventory.service");
const { generateCourierExcel, generateCourierPdf } = require("../services/courierExport.service");
const { canViewAllRecords } = require("../helper/permissionScope");
const { hasDirectionPermission, requireCourierRecordAccess } = require("../helper/courierDirectionAuth");
const { recalculateDay } = require("../services/dailyBalance.service");
const { recalculateCourierChargeForDates } = require("../services/courierCharge.service");
const { createIncomeForCourier, syncIncomeForCourierUpdate, removeIncomeForCourier } = require("../services/incomeSync.service");

const COURIER_STATUSES = ["PENDING", "WAITING_FOR_STOCK", "IN_PROGRESS", "OUT_FOR_DELIVERY", "DONE"];
const STATUS_RANK = { PENDING: 0, WAITING_FOR_STOCK: 1, IN_PROGRESS: 2, OUT_FOR_DELIVERY: 3, DONE: 4 };
const DELIVERY_MODES = ["OFFICE_PICKUP", "COURIER"];

// Included on list/detail reads so the frontend can show per-product availability
// (allocated/fulfilled/backordered) and derive shipment/product status without a second call.
const SALE_ITEM_INCLUDE = {
  model: SaleItem,
  attributes: ["id", "quantity", "allocatedQuantity", "fulfilledQuantity", "backorderedQuantity", "fulfillmentStatus"],
};
const SALE_INCLUDE = { model: Sale, attributes: ["id", "invoiceNumber", "customerName"] };

// Export-only include: pulls serial numbers via the linked SaleItem for the export's Serial
// Number column. Kept separate from SALE_ITEM_INCLUDE so the regular list fetch (used on every
// page load) isn't paying for a join it doesn't need.
const EXPORT_SALE_ITEM_INCLUDE = {
  model: SaleItem,
  attributes: ["id"],
  include: [{ model: SerialUnit, attributes: ["serialNumber"] }],
};

/**
 * Applies the Outgoing Courier filter set (search / date-range / deliveryMode, plus the
 * legacy productName/saleId/direction params) on top of an already scope-restricted where
 * clause. Used identically by getCouriers (list) and exportCouriers (export) so the table and
 * the exported file can never diverge.
 */
const applyCourierFilters = async (scopeWhere, query) => {
  const where = { ...scopeWhere };

  if (query.direction === "IN" || query.direction === "OUT") {
    where.direction = query.direction;
  }
  if (query.productName) {
    where.productName = { [Op.like]: `%${query.productName}%` };
  }
  if (query.saleId) {
    where.saleId = query.saleId;
  }

  if (query.status && query.status !== "ALL") {
    // NOT_DONE is a synthetic bucket (not a real Courier status) used by the Outgoing Pending
    // table to independently paginate every unfinished shipment — mirrors the `pending` flag
    // (status !== "DONE") getCouriers/updateCourier already attach to each row, so a shipment
    // sitting in WAITING_FOR_STOCK/IN_PROGRESS/OUT_FOR_DELIVERY still counts as pending, not
    // just literal PENDING. Left as a separate sentinel rather than overloading "PENDING" so
    // Incoming Courier's exact-status filter (status=PENDING meaning only that one status) is
    // unaffected.
    if (query.status === "NOT_DONE") {
      where.status = { [Op.ne]: "DONE" };
    } else {
      if (!COURIER_STATUSES.includes(query.status)) {
        const err = new Error(`status must be one of: ${COURIER_STATUSES.join(", ")}, NOT_DONE, or ALL`);
        err.statusCode = 400;
        throw err;
      }
      where.status = query.status;
    }
  }

  if (query.deliveryMode) {
    if (!DELIVERY_MODES.includes(query.deliveryMode)) {
      const err = new Error(`deliveryMode must be one of: ${DELIVERY_MODES.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }
    where.deliveryMode = query.deliveryMode;
  }

  // entryDate is DATEONLY — plain 'YYYY-MM-DD' string comparison is sufficient, no
  // end-of-day adjustment needed (unlike a DATETIME column).
  if (query.startDate || query.endDate) {
    where.entryDate = {};
    if (query.startDate) where.entryDate[Op.gte] = query.startDate;
    if (query.endDate) where.entryDate[Op.lte] = query.endDate;
  }

  if (query.search && query.search.trim()) {
    const like = `%${query.search.trim()}%`;

    // Serial number search joins through SaleItem — resolved as a separate lookup (rather
    // than a Sequelize include + top-level Op.or) since combining include with OR across
    // associations is fragile.
    const matchingSerials = await SerialUnit.findAll({
      where: { serialNumber: { [Op.like]: like } },
      attributes: ["saleItemId"],
      raw: true,
    });
    const saleItemIds = [...new Set(matchingSerials.map((s) => s.saleItemId).filter(Boolean))];

    const orConditions = [
      { customerName: { [Op.like]: like } },
      { name: { [Op.like]: like } },
      { mobileNo: { [Op.like]: like } },
      { phone: { [Op.like]: like } },
      { productName: { [Op.like]: like } },
    ];
    if (saleItemIds.length) {
      orConditions.push({ saleItemId: { [Op.in]: saleItemIds } });
    }
    where[Op.or] = orConditions;
  }

  return where;
};

/**
 * Build a where-clause for city-scoped access.
 * - Admin, or a role/user granted "view all" on /couriers: no restriction (returns {})
 * - Non-Admin with allowedCity: filter courier.city = allowedCity
 * - Non-Admin without allowedCity: fall back to userId ownership filter
 */
const buildScopeWhere = async (jwtUser) => {
  if (jwtUser.roleName === "Admin" || (await canViewAllRecords(jwtUser, "/couriers"))) {
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
  if (jwtUser.roleName === "Admin" || (await canViewAllRecords(jwtUser, "/couriers"))) return true;

  const userRecord = await User.findByPk(jwtUser.id, {
    attributes: ["id", "allowedCity"],
  });

  if (userRecord && userRecord.allowedCity) {
    return courier.city === userRecord.allowedCity;
  }

  // Fallback: ownership check
  return courier.userId === jwtUser.id;
};

// GET /couriers — page/limit are optional; when omitted the full (unpaginated) list is
// returned exactly as before, so the existing Outgoing Pending/Completed tables (which never
// send them) are unaffected. Passing either one switches to a paginated response with meta.
exports.getCouriers = async (req, res) => {
  try {
    const user = req.user;
    const scopeWhere = await buildScopeWhere(user);
    const where = await applyCourierFilters(scopeWhere, req.query);

    const include = [
      { model: User, attributes: ["id", "name", "email"] },
      SALE_ITEM_INCLUDE,
      SALE_INCLUDE,
    ];

    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

      const { rows, count } = await Courier.findAndCountAll({
        where,
        include,
        order: [["createdAt", "DESC"]],
        limit,
        offset: (page - 1) * limit,
      });

      return res.status(200).json({
        success: true,
        data: rows,
        meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
      });
    }

    const couriers = await Courier.findAll({
      where,
      include,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: couriers,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// GET /couriers/totals — Courier dashboard KPIs. Same city/ownership scope as getCouriers
// (buildScopeWhere), Outgoing-only (direction: "OUT" — a "deliveries" dashboard has no
// meaning for Incoming records). Two queries: a status-grouped count (bucketed into the
// pipeline stages vs DONE vs CANCELLED) plus a same-day count keyed on entryDate, mirroring
// the two-query shape customerLedger.service.js#getDebtors already uses for this kind of
// bucket-then-sum aggregation.
exports.getCourierTotals = async (req, res) => {
  try {
    const scopeWhere = await buildScopeWhere(req.user);

    const statusRows = await Courier.findAll({
      where: { ...scopeWhere, direction: "OUT" },
      attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
      group: ["status"],
      raw: true,
    });

    let pendingDeliveries = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let totalDeliveries = 0;
    for (const row of statusRows) {
      const count = parseInt(row.count, 10) || 0;
      totalDeliveries += count;
      if (row.status === "DONE") deliveredCount += count;
      else if (row.status === "CANCELLED") cancelledCount += count;
      else pendingDeliveries += count;
    }

    const todayCount = await Courier.count({
      where: { ...scopeWhere, direction: "OUT", entryDate: dayjs().format("YYYY-MM-DD") },
    });

    return res.status(200).json({
      success: true,
      data: { totalDeliveries, pendingDeliveries, deliveredCount, cancelledCount, todayCount },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// GET /couriers/daily-trend?startDate=&endDate= — Courier dashboard trend chart. Same scope
// as getCourierTotals. Grouped by entryDate (already DATEONLY, no date-math needed) — counts
// shipments dispatched per day. Deliberately not mixed with completedDate (delivery date):
// the two are different axes and charting both together would misrepresent the data.
exports.getCourierDailyTrend = async (req, res) => {
  try {
    const scopeWhere = await buildScopeWhere(req.user);
    const { startDate, endDate } = req.query;
    const where = { ...scopeWhere, direction: "OUT" };

    if (startDate || endDate) {
      where.entryDate = {};
      if (startDate) where.entryDate[Op.gte] = startDate;
      if (endDate) where.entryDate[Op.lte] = endDate;
    }

    const rows = await Courier.findAll({
      where,
      attributes: ["entryDate", [sequelize.fn("COUNT", sequelize.col("id")), "shipments"]],
      group: ["entryDate"],
      order: [["entryDate", "ASC"]],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({ date: row.entryDate, shipments: parseInt(row.shipments, 10) || 0 })),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// GET /couriers/export?format=pdf|excel — exports the exact same filtered dataset the
// Outgoing Courier list would show. If no filters are present, defaults to the current
// calendar month's entryDate range instead of exporting everything.
exports.exportCouriers = async (req, res) => {
  try {
    const user = req.user;
    const scopeWhere = await buildScopeWhere(user);

    const query = { ...req.query };
    if (query.direction === undefined) query.direction = "OUT";

    const hasFilters = !!(query.search || query.startDate || query.endDate || query.deliveryMode);
    if (!hasFilters) {
      query.startDate = dayjs().startOf("month").format("YYYY-MM-DD");
      query.endDate = dayjs().endOf("month").format("YYYY-MM-DD");
    }

    const where = await applyCourierFilters(scopeWhere, query);

    const couriers = await Courier.findAll({
      where,
      include: [
        { model: User, attributes: ["id", "name", "email"] },
        EXPORT_SALE_ITEM_INCLUDE,
        SALE_INCLUDE,
      ],
      order: [["entryDate", "DESC"], ["createdAt", "DESC"]],
    });

    const format = req.query.format === "pdf" ? "pdf" : "excel";
    if (format === "pdf") {
      return generateCourierPdf(couriers, res);
    }
    return await generateCourierExcel(couriers, res);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
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

    // Outgoing/Incoming Courier are independently permissioned — the record's own direction
    // decides which one applies (unknown until after the fetch above).
    if (!(await requireCourierRecordAccess(req, res, courier, "read"))) return;

    return res.status(200).json({ success: true, data: courier });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /couriers — manual (non-sale) entries only; sale-linked rows are always created by
// orderService.createOrder, never through this endpoint.
exports.createCourier = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const {
      name, email, phone,
      customerName, address, city, mobileNo, pincode,
      productName, charge, freePickup,
      courierName, trackId, kg, note, reason, entryDate, quantity,
      direction, deliveryMode, to,
    } = req.body || {};

    if (direction !== undefined && direction !== "IN" && direction !== "OUT") {
      await t.rollback();
      return res.status(400).json({ success: false, message: "direction must be either \"IN\" or \"OUT\"" });
    }

    if (!(await hasDirectionPermission(user, direction || "OUT", "create"))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    if (deliveryMode && !DELIVERY_MODES.includes(deliveryMode)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `deliveryMode must be one of: ${DELIVERY_MODES.join(", ")}` });
    }

    const courier = await Courier.create(
      {
        name: name || customerName || null,
        email: email || null,
        phone: phone || mobileNo || null,
        customerName: customerName || name || null,
        address: address || null,
        city: city || null,
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
        reason: reason || null,
        completedDate: null,
        entryDate: entryDate || null,
        quantity: quantity !== undefined && quantity !== "" ? quantity : null,
        direction: direction || "OUT",
        // Defaults to "Courier" (a courier company handles delivery) — user-editable, and
        // "Office Pickup" is the only other option (customer collects in person).
        deliveryMode: deliveryMode || "COURIER",
        to: to || "Madhuram Motor",
        // Owner is always the creator — there's no manual "assign owner" path any more.
        userId: user.id,
      },
      { transaction: t }
    );

    // A manually-created Outgoing courier charge is Income — see
    // incomeSync.service.js#createIncomeForCourier (no-ops for Incoming/free/zero-charge rows).
    const incomeEntryDate = await createIncomeForCourier(courier, { transaction: t, userId: user.id });

    await t.commit();

    // Keep the monthly "Courier Charge" total (see Header.tsx) in sync — it's a live sum of
    // Outgoing, non-free, non-cancelled charges, not a hand-typed figure.
    await recalculateCourierChargeForDates([courier.entryDate]);
    if (incomeEntryDate) await recalculateDay(incomeEntryDate);

    return res.status(201).json({
      success: true,
      message: "Courier created successfully",
      data: courier,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
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
      courierName, trackId, kg, note, reason, entryDate, quantity,
      status, serialNumbers, direction, deliveryMode, to,
    } = req.body || {};

    if (direction !== undefined && direction !== "IN" && direction !== "OUT") {
      await t.rollback();
      return res.status(400).json({ success: false, message: "direction must be either \"IN\" or \"OUT\"" });
    }

    if (deliveryMode !== undefined && deliveryMode !== null && deliveryMode !== "" && !DELIVERY_MODES.includes(deliveryMode)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `deliveryMode must be one of: ${DELIVERY_MODES.join(", ")}` });
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

    // Outgoing/Incoming Courier are independently permissioned — gate on the record's current
    // direction (not the transaction-response helper, since this path needs to roll back first).
    if (!(await hasDirectionPermission(user, courier.direction, "update"))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    // Captured before any field is mutated below — needed to also recalculate the OLD month's
    // Courier Charge total if this edit moves the entryDate across a month boundary.
    const originalEntryDate = courier.entryDate;

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
    if (reason !== undefined) courier.reason = reason;
    if (entryDate !== undefined) courier.entryDate = entryDate;
    if (quantity !== undefined) courier.quantity = quantity !== "" ? quantity : null;
    if (direction !== undefined) courier.direction = direction;
    if (deliveryMode !== undefined) courier.deliveryMode = deliveryMode || "COURIER";
    if (to !== undefined) courier.to = to || "Madhuram Motor";

    // City is editable by any user, regardless of role or entry source.
    if (city !== undefined) courier.city = city;

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

    // Re-picks whichever serial numbers are currently assigned to this line — reserved (not yet
    // fulfilled) or already sold (see inventoryService.reassignSerials for the swap logic).
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

    // charge/freePickup/entryDate/direction/status(CANCELLED via order cancellation) can all
    // move this record in or out of the current Courier Charge sum — recalc both the old and
    // new entryDate's month to be safe.
    await recalculateCourierChargeForDates([originalEntryDate, courier.entryDate], { transaction: t });

    // Keep the linked Account -> Income entry (if any) in sync with this edit — see
    // incomeSync.service.js#syncIncomeForCourierUpdate.
    const incomeEntryDate = await syncIncomeForCourierUpdate(courier, { transaction: t });

    await t.commit();

    if (incomeEntryDate) await recalculateDay(incomeEntryDate);

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

// PUT /couriers/sale/:saleId — updates the status across every Courier row created for one sale
// at once. One sales entry produces one Courier row per product line (see
// order.service.js#createOrder) — the frontend groups them into a single entry keyed on saleId
// (utils/groupCouriers.ts) and this is that entry's Truck/status action, so a status set here is
// consistent across every product in the sale instead of drifting per-row (which previously left
// siblings showing "Mixed"). Scoped to saleId rather than shipmentGroupId so a "Ship Available
// Products" split (which moves some rows to a second shipmentGroupId — see updateShipmentType
// below) still lands on the same one Courier entry instead of splitting it in the UI.
exports.updateCourierBySale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { saleId } = req.params;
    const user = req.user;
    const { status } = req.body || {};

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

    const groupRows = await Courier.findAll({ where: { saleId }, transaction: t, lock: true });
    if (groupRows.length === 0) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "No courier records found for this sale" });
    }

    const allowed = await verifyScope(groupRows[0], user);
    if (!allowed) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Access denied: shipment is outside your allowed scope" });
    }
    if (!(await hasDirectionPermission(user, groupRows[0].direction, "update"))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const previousStatus = groupRows[0].status;
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
    }

    const entryDates = groupRows.map((c) => c.entryDate);
    const today = new Date().toISOString().slice(0, 10);

    for (const courier of groupRows) {
      if (status !== undefined && status !== courier.status && courier.status !== "WAITING_FOR_STOCK") {
        courier.status = status;
        courier.pending = courier.status !== "DONE";
        if (courier.status === "DONE" && !courier.completedDate) {
          courier.completedDate = today;
        }
        await courier.save({ transaction: t });
      }
    }

    await recalculateCourierChargeForDates(entryDates, { transaction: t });

    await t.commit();

    // Notify the salesperson who created the linked sale when the shipment is marked Done —
    // once per sale, not once per product row.
    if (previousStatus !== "DONE" && status === "DONE") {
      const sale = await Sale.findByPk(saleId, { attributes: ["id", "invoiceNumber", "customerName", "createdBy"] });
      if (sale && sale.createdBy) {
        const productNames = groupRows.map((c) => c.productName).filter(Boolean).join(", ");
        await notify([
          {
            recipientModule: "account",
            recipientUserId: sale.createdBy,
            type: "ORDER_FULFILLED",
            title: "Order Delivered",
            message: `Invoice ${sale.invoiceNumber}: ${productNames || "order"} for ${sale.customerName} marked Done by the courier team.`,
            referenceType: "sale",
            referenceId: sale.id,
            event: "order_delivered",
            payload: { sale: { id: sale.id, invoiceNumber: sale.invoiceNumber } },
          },
        ]);
      }
    }

    const updated = await Courier.findAll({
      where: { saleId },
      include: [{ model: User, attributes: ["id", "name", "email"] }, SALE_ITEM_INCLUDE, SALE_INCLUDE],
    });

    return res.status(200).json({
      success: true,
      message: "Courier shipment updated successfully",
      data: updated,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /couriers/sale/:saleId — deletes every Courier row created for one sale at
// once (the grouped entry's Delete action — see Couriers.tsx#renderGroupRow). Deleting rows
// individually would orphan siblings still sharing the group's shared fields, so this always
// removes the whole shipment together, same scope/permission checks as the single-row delete.
exports.deleteCourierBySale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { saleId } = req.params;
    const user = req.user;

    const groupRows = await Courier.findAll({ where: { saleId }, transaction: t, lock: true });
    if (groupRows.length === 0) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "No courier records found for this sale" });
    }

    const allowed = await verifyScope(groupRows[0], user);
    if (!allowed) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Access denied: shipment is outside your allowed scope" });
    }
    if (!(await hasDirectionPermission(user, groupRows[0].direction, "delete"))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }

    const entryDates = groupRows.map((c) => c.entryDate);
    await Courier.destroy({ where: { saleId }, transaction: t });
    await recalculateCourierChargeForDates(entryDates, { transaction: t });

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Courier shipment deleted successfully",
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

// PUT /couriers/:id/done — Incoming-only workflow. In one transaction: marks the Incoming
// courier Done, creates the mirrored Outgoing Courier record, and creates the Accounts
// (Expense) entry for the courier charge. Row-locked so a repeated click can never create a
// second Outgoing/Accounts pair — a concurrent second request blocks on the lock, then sees
// status already DONE and is rejected before it writes anything.
exports.completeIncomingCourier = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id, { transaction: t, lock: true });
    if (!courier) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    if (courier.direction !== "IN") {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Only Incoming Courier entries can be completed this way" });
    }

    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    if (courier.status === "DONE") {
      await t.rollback();
      return res.status(400).json({ success: false, message: "This incoming courier has already been completed" });
    }

    const today = dayjs().format("YYYY-MM-DD");

    const outgoing = await Courier.create(
      {
        name: courier.customerName || courier.name || null,
        customerName: courier.customerName || courier.name || null,
        address: courier.address,
        city: courier.city,
        pincode: courier.pincode,
        mobileNo: courier.mobileNo,
        phone: courier.phone,
        productName: courier.productName,
        charge: courier.charge,
        freePickup: courier.freePickup,
        // Not copied: the customer's incoming courier company has no bearing on which company
        // our team picks to ship it back out — left null for them to set via the normal edit flow.
        courierName: null,
        kg: courier.kg,
        quantity: courier.quantity,
        note: `Auto-created from Incoming Courier #${courier.id}`,
        entryDate: today,
        status: "PENDING",
        pending: true,
        direction: "OUT",
        userId: courier.userId,
        linkedCourierId: courier.id,
      },
      { transaction: t }
    );

    const accountEntry = await AccountEntry.create(
      {
        entryType: "EXPENSE",
        category: "Courier",
        customerName: courier.customerName || courier.name || null,
        customerPhone: courier.mobileNo || courier.phone || null,
        productName: courier.productName || null,
        description: `Incoming courier charge — ${courier.customerName || courier.name || "Unknown customer"}${courier.productName ? ` (${courier.productName})` : ""}`,
        amount: courier.charge || 0,
        entryDate: today,
        referenceType: "courier",
        referenceId: courier.id,
        courierId: courier.id,
        // Auto-created expenses go through the same approval workflow as manually-added ones —
        // an Admin must approve before it counts toward the Total Out balance.
        status: "PENDING",
        createdBy: user.id,
      },
      { transaction: t }
    );

    courier.status = "DONE";
    courier.pending = false;
    courier.completedDate = courier.completedDate || today;
    courier.linkedCourierId = outgoing.id;
    await courier.save({ transaction: t });

    // The auto-created Outgoing record carries over `charge`/`freePickup` — count it in this
    // month's Courier Charge total same as any other Outgoing courier.
    await recalculateCourierChargeForDates([outgoing.entryDate], { transaction: t });

    await t.commit();

    // Feed the Account daily balance rollup (runs its own transaction — see
    // services/dailyBalance.service.js).
    await recalculateDay(today);

    const notifyMessage = `Incoming Courier completed for ${courier.customerName || courier.name || "Unknown customer"} – ${courier.productName || "item"}.`;
    await notify([
      {
        recipientModule: "admin",
        type: "INCOMING_COURIER_COMPLETED",
        title: "Incoming Courier Completed",
        message: notifyMessage,
        referenceType: "courier",
        referenceId: courier.id,
        event: "incoming_courier_done",
        payload: { courierId: courier.id, outgoingCourierId: outgoing.id, accountEntryId: accountEntry.id },
      },
      {
        recipientModule: "couriers",
        recipientUserId: courier.userId,
        type: "INCOMING_COURIER_COMPLETED",
        title: "Incoming Courier Completed",
        message: notifyMessage,
        referenceType: "courier",
        referenceId: courier.id,
        event: "incoming_courier_done",
        payload: { courierId: courier.id, outgoingCourierId: outgoing.id, accountEntryId: accountEntry.id },
      },
      {
        recipientModule: "admin",
        type: "EXPENSE_PENDING_APPROVAL",
        title: "New Expense Pending Approval",
        message: `₹${Number(accountEntry.amount).toLocaleString("en-IN")} expense requires your approval.`,
        referenceType: "accountEntry",
        referenceId: accountEntry.id,
        event: "expense_pending_approval",
        payload: { expenseId: accountEntry.id },
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "Incoming courier marked Done — Outgoing Courier and Accounts entries created",
      data: { courier, outgoingCourier: outgoing, accountEntry },
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /couriers/:id
exports.deleteCourier = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;

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

    if (!(await requireCourierRecordAccess(req, res, courier, "delete"))) {
      await t.rollback();
      return;
    }

    const { entryDate } = courier;
    // Remove the linked Income entry (if any) before the courier itself is gone — see
    // incomeSync.service.js#removeIncomeForCourier.
    const removedIncomeDate = await removeIncomeForCourier(courier.id, { transaction: t });
    await courier.destroy({ transaction: t });
    await recalculateCourierChargeForDates([entryDate], { transaction: t });

    await t.commit();

    if (removedIncomeDate) await recalculateDay(removedIncomeDate);

    return res.status(200).json({
      success: true,
      message: "Courier deleted successfully",
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(500).json({ success: false, message: err.message });
  }
};
