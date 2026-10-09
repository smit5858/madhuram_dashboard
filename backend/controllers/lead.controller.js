const { Lead, Platform, Product, Stock, User, Sale } = require("../models");
const { Op } = require("sequelize");
const { canViewAllRecords } = require("../helper/permissionScope");
const { notify } = require("../services/notification.service");
const orderService = require("../services/order.service");
const { exportLeads: exportLeadFile, STATUS_LABELS, APPROVAL_LABELS } = require("../services/leadExport.service");
const dayjs = require("dayjs");

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
// Skipped entirely when the lead has no productId (the "Other" option in
// ProductAutocompleteField) — there's no Product row to seed a sale line item with, so no Sell
// is ever auto-created for these leads regardless of status.
// Idempotent: a Lead has at most one linked Sale (unique index on Sale.leadId), so this is safe
// to call every time the lead is saved as Complete, not just on the first transition.
// The Sale is owned by the lead's own creator (not necessarily the caller — an Admin can flip
// another employee's lead to Complete) so it correctly counts under that employee's own Sells.
// A failure here must never fail the Lead save itself — it's logged and swallowed.
const ensureSaleForLead = async (lead) => {
  if (!lead.productId) return null;

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

  const { startDate: createdFrom, endDate: createdTo } = resolveCreatedRange({ startDate, endDate, month: query.month });
  if (createdFrom || createdTo) {
    where.createdAt = {};
    // Both bounds in server-local time ("T00:00:00" — a bare YYYY-MM-DD would parse as UTC
    // midnight and drop the start day's early-morning leads), inclusive of the whole end day.
    if (createdFrom) where.createdAt[Op.gte] = new Date(`${createdFrom}T00:00:00`);
    if (createdTo) where.createdAt[Op.lte] = new Date(`${createdTo}T23:59:59.999`);
  }

  return where;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isValidDate = (value) => DATE_RE.test(value) && dayjs(value).format("YYYY-MM-DD") === value;
const isPositiveInt = (value) => /^\d+$/.test(String(value)) && parseInt(value, 10) > 0;

// Created-date range from an explicit startDate/endDate, or else a whole `month` (YYYY-MM).
// An explicit range always wins so the table's date pickers and a month shortcut can't conflict.
const resolveCreatedRange = ({ startDate, endDate, month }) => {
  if (startDate || endDate) return { startDate, endDate };
  if (month && MONTH_RE.test(month)) {
    const first = dayjs(`${month}-01`);
    return { startDate: first.format("YYYY-MM-DD"), endDate: first.endOf("month").format("YYYY-MM-DD") };
  }
  return {};
};

// Strict validation for the export endpoint only — getLeads keeps its existing lenient parsing.
const validateLeadExportQuery = (query) => {
  const { format, startDate, endDate, month, followUpStartDate, followUpEndDate, status, approvalStatus, salesEmployeeId, platformId, productId, search } =
    query;
  if (format && !["pdf", "excel"].includes(format)) return "format must be pdf or excel";
  for (const [name, value] of Object.entries({ startDate, endDate, followUpStartDate, followUpEndDate })) {
    if (value && !isValidDate(value)) return `${name} must be a valid date (YYYY-MM-DD)`;
  }
  if (month && !MONTH_RE.test(month)) return "month must be in YYYY-MM format";
  if (startDate && endDate && startDate > endDate) return "startDate cannot be after endDate";
  if (followUpStartDate && followUpEndDate && followUpStartDate > followUpEndDate) return "followUpStartDate cannot be after followUpEndDate";
  if (status && !VALID_STATUSES.includes(status)) return `status must be one of ${VALID_STATUSES.join(", ")}`;
  if (approvalStatus && !VALID_APPROVAL_STATUSES.includes(approvalStatus)) {
    return `approvalStatus must be one of ${VALID_APPROVAL_STATUSES.join(", ")}`;
  }
  for (const [name, value] of Object.entries({ salesEmployeeId, platformId, productId })) {
    if (value && !isPositiveInt(value)) return `${name} must be a valid id`;
  }
  if (search && String(search).length > 150) return "Search term is too long";
  return null;
};

const LEAD_EXPORT_ATTRIBUTES = [
  "id",
  "customerName",
  "companyName",
  "phone",
  "address",
  "city",
  "quantity",
  "status",
  "approvalStatus",
  "createdBy",
  "createdAt",
  ...[1, 2, 3].flatMap((n) => [`followUp${n}Date`, `followUp${n}Status`, `followUp${n}Notes`]),
];

const LEAD_EXPORT_INCLUDE = [
  { model: Platform, as: "platform", attributes: ["name"] },
  { model: Product, as: "product", attributes: ["name"] },
  { model: User, as: "salesEmployee", attributes: ["name"] },
];

const describeLeadPeriod = ({ startDate, endDate }) => {
  if (!startDate && !endDate) return "All dates";
  if (startDate && endDate) {
    const first = dayjs(startDate);
    if (first.date() === 1 && first.endOf("month").format("YYYY-MM-DD") === endDate) return first.format("MMMM YYYY");
    return `${formatDisplay(startDate)} to ${formatDisplay(endDate)}`;
  }
  return startDate ? `From ${formatDisplay(startDate)}` : `Up to ${formatDisplay(endDate)}`;
};

// Leads_2026-10 for a whole month, Leads_2026-10-01_to_2026-10-15 for a range, Leads_All otherwise.
// Kept in sync with frontend lead.service.ts#leadExportFileName.
const leadExportFileBase = ({ startDate, endDate }) => {
  if (startDate && endDate) {
    const first = dayjs(startDate);
    if (first.date() === 1 && first.endOf("month").format("YYYY-MM-DD") === endDate) return `Leads_${first.format("YYYY-MM")}`;
    return `Leads_${startDate}_to_${endDate}`;
  }
  if (startDate) return `Leads_from_${startDate}`;
  if (endDate) return `Leads_until_${endDate}`;
  return "Leads_All";
};

const formatDisplay = (value) => dayjs(value).format("DD-MM-YYYY");

// GET /leads/export?format=pdf|excel&<same filters as GET /leads>&month=YYYY-MM
// Exports EVERY lead matching the list's filters (unpaginated). Scope comes from the same
// buildLeadWhere as the table, so a user without viewAllRecords is always pinned to their own
// leads — a salesEmployeeId they pass is ignored, never trusted.
exports.exportLeads = async (req, res) => {
  try {
    const validationError = validateLeadExportQuery(req.query);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const canViewAll = await canViewAllRecords(req.user, ROUTE_PATH);
    const { salesEmployeeId, platformId, productId } = req.query;

    let employeeLabel = "All Employees";
    if (!canViewAll) {
      const self = await User.findByPk(req.user.id, { attributes: ["name"] });
      employeeLabel = self?.name || "My Leads";
    } else if (salesEmployeeId) {
      const employee = await User.findByPk(salesEmployeeId, { attributes: ["name"] });
      if (!employee) return res.status(400).json({ success: false, message: "Selected employee does not exist" });
      employeeLabel = employee.name;
    }

    const where = await buildLeadWhere(req.user, req.query);
    const rows = await Lead.findAll({
      where,
      attributes: LEAD_EXPORT_ATTRIBUTES,
      include: LEAD_EXPORT_INCLUDE,
      order: [["createdAt", "DESC"], ["id", "DESC"]],
    });

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No leads match the selected filters" });
    }

    const [platform, product] = await Promise.all([
      platformId ? Platform.findByPk(platformId, { attributes: ["name"] }) : null,
      productId ? Product.findByPk(productId, { attributes: ["name"] }) : null,
    ]);
    const { search, status, approvalStatus, city, followUpStartDate, followUpEndDate } = req.query;
    const filterParts = [];
    if (status) filterParts.push(`Status: ${STATUS_LABELS[status]}`);
    if (approvalStatus) filterParts.push(`Approval: ${APPROVAL_LABELS[approvalStatus]}`);
    if (platform) filterParts.push(`Source: ${platform.name}`);
    if (product) filterParts.push(`Product: ${product.name}`);
    if (city && city.trim()) filterParts.push(`City: ${city.trim()}`);
    if (followUpStartDate || followUpEndDate) {
      filterParts.push(
        `Follow-up: ${followUpStartDate ? formatDisplay(followUpStartDate) : "Start"} to ${followUpEndDate ? formatDisplay(followUpEndDate) : "Any"}`
      );
    }
    if (search && search.trim()) filterParts.push(`Search: "${search.trim()}"`);

    const createdRange = resolveCreatedRange(req.query);
    const format = req.query.format === "pdf" ? "pdf" : "excel";
    return await exportLeadFile(
      format,
      rows.map((r) => r.get({ plain: true })),
      {
        periodLabel: describeLeadPeriod(createdRange),
        employeeLabel,
        filterLabel: filterParts.length ? `Filters — ${filterParts.join(" | ")}` : "Filters — None",
        fileBaseName: leadExportFileBase(createdRange),
      },
      res
    );
  } catch (err) {
    // Once the file stream has started the JSON error can't be sent — just cut the response.
    if (res.headersSent) return res.end();
    return errorResponse(res, err);
  }
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
  const { platformId, customerName, phone, quantity, followUp1Date, status } = body || {};
  if (!platformId) return "Platform is required";
  if (!customerName || !String(customerName).trim()) return "Customer name is required";
  if (!phone || !String(phone).trim()) return "Phone number is required";
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
    productId: productId || null,
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

    let product = null;
    if (req.body.productId) {
      product = await Product.findByPk(req.body.productId);
      if (!product) return res.status(400).json({ success: false, message: "Selected product does not exist" });
    }

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
          message: `${req.user.name || "A sales employee"} added a lead for ${lead.customerName} (${product ? product.name : "General Enquiry"}).`,
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

    if (req.body.productId) {
      const product = await Product.findByPk(req.body.productId);
      if (!product) return res.status(400).json({ success: false, message: "Selected product does not exist" });
    }

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
