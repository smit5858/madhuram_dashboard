const { Lead, Platform, Product, Stock, User, Sale } = require("../models");
const { Op } = require("sequelize");
const { canViewAllRecords } = require("../helper/permissionScope");
const { notify } = require("../services/notification.service");
const orderService = require("../services/order.service");

const ROUTE_PATH = "/leads";

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

const LEAD_INCLUDE = [
  { model: Platform, as: "platform", attributes: ["id", "name"] },
  { model: Product, as: "product", attributes: ["id", "name"] },
  { model: User, as: "salesEmployee", attributes: ["id", "name"] },
  { model: User, as: "approver", attributes: ["id", "name"] },
  { model: Sale, as: "sale", attributes: ["id", "invoiceNumber", "status", "sellingAmount", "collectedAmount", "pendingAmount"] },
];

// Auto-creates the Sell for a Lead whose status is Complete (see createLead/updateLead below).
// Idempotent: a Lead has at most one linked Sale (unique index on Sale.leadId), so this is safe
// to call every time the lead is saved as Complete, not just on the first transition.
// The Sale is owned by the lead's own creator (not necessarily the caller — an Admin can flip
// another employee's lead to Complete) so it correctly counts under that employee's own Sells.
// A failure here must never fail the Lead save itself — it's logged and swallowed.
const ensureSaleForLead = async (lead) => {
  const existing = await Sale.findOne({ where: { leadId: lead.id } });
  if (existing) return existing;

  try {
    // Seed the line item at the product's own configured price (its "tag price" — Stock.sellingPrice,
    // which NON_SERIAL, SOFTWARE, and HARDWARE_ORDER_BASED products all carry) instead of ₹0, so
    // the Sales member opens a sale that already reflects the product's real price and only needs
    // to confirm/adjust it, not look it up and type it in from scratch. SERIALIZED products have
    // no single product-level price (pricing is per unit — see product.controller.js#serializeProduct),
    // so those still start at 0.
    const product = await Product.findByPk(lead.productId, { include: [Stock] });
    const initialSellingPrice = product && product.productType !== "SERIALIZED" && product.Stock ? parseFloat(product.Stock.sellingPrice) || 0 : 0;

    const sale = await orderService.createOrder({
      customerName: lead.customerName,
      customerNumber: lead.phone,
      city: lead.city,
      fromAddress: lead.address,
      sellingAmount: 0,
      collectedAmount: 0,
      items: [{ productId: lead.productId, quantity: lead.quantity, sellingPrice: initialSellingPrice }],
      userId: lead.createdBy,
      leadId: lead.id,
      // Only the Sale itself gets created here — no Courier entry (the assigned Sales member
      // opts into shipping via the checkbox once the sale's real details are filled in) and no
      // Account entry (nothing to book yet at sellingAmount/collectedAmount 0; the entry is
      // created automatically the first time the Sales member saves real amounts — see
      // incomeSync.service.js#syncIncomeForSaleUpdate).
      createCourierEntry: false,
      createAccountEntry: false,
    });
    return sale;
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return Sale.findOne({ where: { leadId: lead.id } });
    }
    console.error(`Failed to auto-create Sell for Lead #${lead.id}:`, err);
    return null;
  }
};

const VALID_STATUSES = ["PENDING", "PROGRESS", "COMPLETED", "INCOMPLETED", "NOT_INTERESTED"];
const VALID_APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
const VALID_FOLLOWUP_STATUSES = ["PENDING", "DONE"];

const serializeLead = (row) => ({
  id: row.id,
  platformId: row.platformId,
  platform: row.platform || null,
  customerName: row.customerName,
  companyName: row.companyName,
  phone: row.phone,
  address: row.address,
  city: row.city,
  productId: row.productId,
  product: row.product || null,
  quantity: row.quantity,
  followUp1Date: row.followUp1Date,
  followUp1Time: row.followUp1Time,
  followUp1Notes: row.followUp1Notes,
  followUp1Status: row.followUp1Status,
  followUp2Date: row.followUp2Date,
  followUp2Time: row.followUp2Time,
  followUp2Notes: row.followUp2Notes,
  followUp2Status: row.followUp2Status,
  followUp3Date: row.followUp3Date,
  followUp3Time: row.followUp3Time,
  followUp3Notes: row.followUp3Notes,
  followUp3Status: row.followUp3Status,
  status: row.status,
  approvalStatus: row.approvalStatus,
  approvedBy: row.approvedBy,
  approvedAt: row.approvedAt,
  rejectionReason: row.rejectionReason,
  createdBy: row.createdBy,
  salesEmployee: row.salesEmployee || null,
  approver: row.approver || null,
  saleId: row.sale?.id || null,
  sale: row.sale || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

// Builds the Leads list where-clause (ownership scope + platform/salesEmployee/status/product/
// city/follow-up-date/created-date filters + search-by-name/company/phone/id). Used by getLeads
// and getLeadStats so the table and the KPI counts can never disagree on scope.
const buildLeadWhere = async (user, query) => {
  const canViewAll = user && (await canViewAllRecords(user, ROUTE_PATH));
  const {
    search,
    status,
    approvalStatus,
    platformId,
    productId,
    city,
    salesEmployeeId,
    followUpStartDate,
    followUpEndDate,
    startDate,
    endDate,
  } = query;

  const where = {};

  if (canViewAll) {
    if (salesEmployeeId) where.createdBy = salesEmployeeId;
  } else {
    where.createdBy = user.id;
  }

  if (status && VALID_STATUSES.includes(status)) where.status = status;
  if (approvalStatus && VALID_APPROVAL_STATUSES.includes(approvalStatus)) where.approvalStatus = approvalStatus;
  if (platformId) where.platformId = platformId;
  if (productId) where.productId = productId;
  if (city && city.trim()) where.city = { [Op.like]: `%${city.trim()}%` };

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const idAsNumber = parseInt(search.trim(), 10);
    where[Op.or] = [
      { customerName: { [Op.like]: term } },
      { companyName: { [Op.like]: term } },
      { phone: { [Op.like]: term } },
      ...(Number.isNaN(idAsNumber) ? [] : [{ id: idAsNumber }]),
    ];
  }

  if (followUpStartDate || followUpEndDate) {
    where.followUp1Date = {};
    if (followUpStartDate) where.followUp1Date[Op.gte] = followUpStartDate;
    if (followUpEndDate) where.followUp1Date[Op.lte] = followUpEndDate;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = end;
    }
  }

  return where;
};

// GET /leads
exports.getLeads = async (req, res) => {
  try {
    const where = await buildLeadWhere(req.user, req.query);
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await Lead.findAndCountAll({
      where,
      include: LEAD_INCLUDE,
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: rows.map(serializeLead),
      meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /leads/:id
exports.getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id, { include: LEAD_INCLUDE });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const canViewAll = await canViewAllRecords(req.user, ROUTE_PATH);
    if (!canViewAll && lead.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only view your own leads" });
    }

    return res.status(200).json({ success: true, data: serializeLead(lead) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validateLeadPayload = (body) => {
  const { platformId, customerName, phone, productId, quantity, followUp1Date, status } = body || {};
  if (!platformId) return "Platform is required";
  if (!customerName || !String(customerName).trim()) return "Customer name is required";
  if (!phone || !String(phone).trim()) return "Phone number is required";
  if (!productId) return "Product is required";
  if (quantity === undefined || quantity === null || isNaN(parseInt(quantity, 10)) || parseInt(quantity, 10) <= 0) {
    return "A valid quantity greater than 0 is required";
  }
  if (!followUp1Date) return "Follow-up 1 date is required";
  if (status && !VALID_STATUSES.includes(status)) return `status must be one of ${VALID_STATUSES.join(", ")}`;
  return null;
};

// Only the fields a client is allowed to set — approvalStatus/approvedBy/approvedAt/
// rejectionReason/createdBy are never taken from the request body (see approveLead/rejectLead).
const pickLeadFields = (body) => {
  const {
    platformId,
    customerName,
    companyName,
    phone,
    address,
    city,
    productId,
    quantity,
    followUp1Date,
    followUp1Time,
    followUp1Notes,
    followUp1Status,
    followUp2Date,
    followUp2Time,
    followUp2Notes,
    followUp2Status,
    followUp3Date,
    followUp3Time,
    followUp3Notes,
    followUp3Status,
    status,
  } = body || {};

  return {
    platformId,
    customerName: String(customerName).trim(),
    companyName: companyName && String(companyName).trim() ? String(companyName).trim() : null,
    phone: String(phone).trim(),
    address: address && String(address).trim() ? String(address).trim() : null,
    city: city && String(city).trim() ? String(city).trim() : null,
    productId,
    quantity: parseInt(quantity, 10),
    followUp1Date,
    followUp1Time: followUp1Time || null,
    followUp1Notes: followUp1Notes || null,
    followUp1Status: VALID_FOLLOWUP_STATUSES.includes(followUp1Status) ? followUp1Status : "PENDING",
    followUp2Date: followUp2Date || null,
    followUp2Time: followUp2Time || null,
    followUp2Notes: followUp2Notes || null,
    followUp2Status: VALID_FOLLOWUP_STATUSES.includes(followUp2Status) ? followUp2Status : "PENDING",
    followUp3Date: followUp3Date || null,
    followUp3Time: followUp3Time || null,
    followUp3Notes: followUp3Notes || null,
    followUp3Status: VALID_FOLLOWUP_STATUSES.includes(followUp3Status) ? followUp3Status : "PENDING",
    status: VALID_STATUSES.includes(status) ? status : "PENDING",
  };
};

// POST /leads — any authenticated user with canCreate on /leads. An Admin's own lead is
// auto-approved (self-approval doesn't apply to Admin, same as everywhere else in the app);
// anyone else's starts approvalStatus PENDING, awaiting Admin review.
exports.createLead = async (req, res) => {
  try {
    const validationError = validateLeadPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const platform = await Platform.findByPk(req.body.platformId);
    if (!platform) return res.status(400).json({ success: false, message: "Selected platform does not exist" });

    const product = await Product.findByPk(req.body.productId);
    if (!product) return res.status(400).json({ success: false, message: "Selected product does not exist" });

    const isAdmin = req.user.roleName === "Admin";

    const lead = await Lead.create({
      ...pickLeadFields(req.body),
      approvalStatus: isAdmin ? "APPROVED" : "PENDING",
      approvedBy: isAdmin ? req.user.id : null,
      approvedAt: isAdmin ? new Date() : null,
      createdBy: req.user.id,
    });

    if (!isAdmin) {
      await notify([
        {
          recipientModule: "admin",
          type: "LEAD_APPROVAL_REQUIRED",
          title: "New Lead Awaiting Approval",
          message: `${req.user.name || "A sales employee"} added a lead for ${lead.customerName} (${product.name}).`,
          referenceType: "lead",
          referenceId: lead.id,
          event: "lead_created",
          payload: { leadId: lead.id },
        },
      ]);
    }

    // Sell auto-creation doesn't wait on Admin approval — a lead saved as Complete gets its
    // Sell immediately, approved or not.
    if (lead.status === "COMPLETED") {
      await ensureSaleForLead(lead);
    }

    const leadWithIncludes = await Lead.findByPk(lead.id, { include: LEAD_INCLUDE });
    return res.status(201).json({ success: true, message: "Lead created successfully", data: serializeLead(leadWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /leads/:id — owner or a viewAllRecords-granted user only. Never touches approvalStatus/
// approvedBy/approvedAt/rejectionReason — approval stays a one-time Admin gate set at creation
// (see createLead) and changed only via approveLead/rejectLead below.
exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    const canViewAll = await canViewAllRecords(req.user, ROUTE_PATH);
    if (!canViewAll && lead.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only edit your own leads" });
    }

    const validationError = validateLeadPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const platform = await Platform.findByPk(req.body.platformId);
    if (!platform) return res.status(400).json({ success: false, message: "Selected platform does not exist" });

    const product = await Product.findByPk(req.body.productId);
    if (!product) return res.status(400).json({ success: false, message: "Selected product does not exist" });

    await lead.update(pickLeadFields(req.body));

    // Same as createLead — see ensureSaleForLead.
    if (lead.status === "COMPLETED") {
      await ensureSaleForLead(lead);
    }

    const leadWithIncludes = await Lead.findByPk(lead.id, { include: LEAD_INCLUDE });
    return res.status(200).json({ success: true, message: "Lead updated successfully", data: serializeLead(leadWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /leads/:id — gated purely by canDelete on /leads (authorize middleware); Sales
// Employees are simply never granted it (see server.js#grantInitialLeadsAccess), so no extra
// role check is needed here.
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    await lead.destroy();
    return res.status(200).json({ success: true, message: "Lead deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /leads/:id/approve — Admin only, enforced inline (not via canUpdate) — a Sales Employee
// can never approve a lead, including their own.
exports.approveLead = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can approve a lead" });
    }

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    lead.approvalStatus = "APPROVED";
    lead.approvedBy = req.user.id;
    lead.approvedAt = new Date();
    lead.rejectionReason = null;
    await lead.save();

    await notify([
      {
        recipientModule: "leads",
        recipientUserId: lead.createdBy,
        type: "LEAD_APPROVED",
        title: "Lead Approved",
        message: `Your lead for ${lead.customerName} was approved.`,
        referenceType: "lead",
        referenceId: lead.id,
        event: "lead_approved",
        payload: { leadId: lead.id },
      },
    ]);

    const leadWithIncludes = await Lead.findByPk(lead.id, { include: LEAD_INCLUDE });
    return res.status(200).json({ success: true, message: "Lead approved", data: serializeLead(leadWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /leads/:id/reject — Admin only. rejectionReason required.
exports.rejectLead = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can reject a lead" });
    }

    const { rejectionReason } = req.body || {};
    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ success: false, message: "rejectionReason is required" });
    }

    const lead = await Lead.findByPk(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    lead.approvalStatus = "REJECTED";
    lead.approvedBy = req.user.id;
    lead.approvedAt = new Date();
    lead.rejectionReason = String(rejectionReason).trim();
    await lead.save();

    await notify([
      {
        recipientModule: "leads",
        recipientUserId: lead.createdBy,
        type: "LEAD_REJECTED",
        title: "Lead Rejected",
        message: `Your lead for ${lead.customerName} was rejected: ${lead.rejectionReason}`,
        referenceType: "lead",
        referenceId: lead.id,
        event: "lead_rejected",
        payload: { leadId: lead.id },
      },
    ]);

    const leadWithIncludes = await Lead.findByPk(lead.id, { include: LEAD_INCLUDE });
    return res.status(200).json({ success: true, message: "Lead rejected", data: serializeLead(leadWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /leads/stats — powers the dashboard widgets. Scoped by the same ownership rule as
// getLeads (Admin/viewAllRecords sees every lead, everyone else sees only their own).
exports.getLeadStats = async (req, res) => {
  try {
    const where = await buildLeadWhere(req.user, {});

    const [total, pending, progress, completed, incompleted, notInterested] = await Promise.all([
      Lead.count({ where }),
      Lead.count({ where: { ...where, status: "PENDING" } }),
      Lead.count({ where: { ...where, status: "PROGRESS" } }),
      Lead.count({ where: { ...where, status: "COMPLETED" } }),
      Lead.count({ where: { ...where, status: "INCOMPLETED" } }),
      Lead.count({ where: { ...where, status: "NOT_INTERESTED" } }),
    ]);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const [todayFollowUps, upcomingFollowUps, overdueFollowUps] = await Promise.all([
      Lead.count({ where: { ...where, followUp1Date: todayStr, followUp1Status: "PENDING" } }),
      Lead.count({ where: { ...where, followUp1Date: { [Op.gt]: todayStr }, followUp1Status: "PENDING" } }),
      Lead.count({ where: { ...where, followUp1Date: { [Op.lt]: todayStr }, followUp1Status: "PENDING" } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        progress,
        completed,
        incompleted,
        notInterested,
        todayFollowUps,
        upcomingFollowUps,
        overdueFollowUps,
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};
