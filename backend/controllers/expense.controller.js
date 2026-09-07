const { AccountEntry, User } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { recalculateDay } = require("../services/dailyBalance.service");
const { notify } = require("../services/notification.service");

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

// AccountEntry reuses its Income columns (customerName/customerPhone/productName) for
// Expense's Name/Mobile/Product fields — this maps the API's expense-shaped request/response
// onto those shared columns so the two ledgers can keep sharing one table/model.
const serializeExpense = (row) => ({
  id: row.id,
  entryType: row.entryType,
  category: row.category,
  customerId: row.customerId,
  name: row.customerName,
  mobile: row.customerPhone,
  product: row.productName,
  amount: row.amount,
  entryDate: row.entryDate,
  paymentMethod: row.paymentMethod,
  bankName: row.bankName,
  description: row.description,
  status: row.status,
  creator: row.creator || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

// Pending Bill payoffs auto-create an AccountEntry (category "Pending Bill") purely so they count
// toward the Total Out balance — they're a distinct module with their own page/workflow and must
// never appear in the Expense list itself (see pendingBillService.js#recalculateStatus).
const buildExpenseWhere = (query) => {
  const { search, status } = query;
  const where = { entryType: "EXPENSE", category: { [Op.ne]: "Pending Bill" } };

  if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) where.status = status;
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { customerName: { [Op.like]: term } },
      { customerPhone: { [Op.like]: term } },
      { productName: { [Op.like]: term } },
    ];
  }

  return where;
};

// GET /expense?search=&status=&page=&limit=
exports.getExpenses = async (req, res) => {
  try {
    const where = buildExpenseWhere(req.query);
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await AccountEntry.findAndCountAll({
      where,
      include: [{ model: User, as: "creator", attributes: ["id", "name"] }],
      order: [["entryDate", "DESC"], ["createdAt", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    });

    return res.status(200).json({
      success: true,
      data: rows.map(serializeExpense),
      meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /expense/totals — approved-only sum/count, mirrors income.controller.js#getIncomeTotals.
// Pending expenses are deliberately excluded, same as they are from the daily balance.
exports.getExpenseTotals = async (req, res) => {
  try {
    const result = await AccountEntry.findOne({
      where: { entryType: "EXPENSE", status: "APPROVED" },
      attributes: [
        [sequelize.fn("SUM", sequelize.col("amount")), "totalExpense"],
        [sequelize.fn("COUNT", sequelize.col("id")), "totalCount"],
      ],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: {
        totalExpense: parseFloat(result?.totalExpense) || 0,
        totalCount: parseInt(result?.totalCount, 10) || 0,
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /expense/:id
exports.getExpenseById = async (req, res) => {
  try {
    const entry = await AccountEntry.findOne({
      where: { id: req.params.id, entryType: "EXPENSE", category: { [Op.ne]: "Pending Bill" } },
      include: [{ model: User, as: "creator", attributes: ["id", "name"] }],
    });
    if (!entry) return res.status(404).json({ success: false, message: "Expense not found" });
    return res.status(200).json({ success: true, data: serializeExpense(entry) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validateExpensePayload = (body) => {
  const { name, amount, entryDate } = body || {};
  if (!name || !String(name).trim()) return "Name is required";
  if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return "A valid amount greater than 0 is required";
  }
  if (!entryDate) return "Date is required";
  return null;
};

// POST /expense — any authenticated user with canCreate on /account/expense (checked by the
// authorize() middleware in expense.routes.js). Always created PENDING — only an Admin approving
// it later (see approveExpense below) can make it count toward the Total Out balance.
exports.createExpense = async (req, res) => {
  try {
    const validationError = validateExpensePayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const { customerId, name, mobile, product, amount, entryDate, paymentMethod, bankName, description } = req.body;

    const entry = await AccountEntry.create({
      entryType: "EXPENSE",
      category: "Expense",
      customerId: customerId || null,
      customerName: name.trim(),
      customerPhone: mobile || null,
      productName: product || null,
      amount: parseFloat(amount),
      entryDate,
      paymentMethod: paymentMethod || null,
      bankName: paymentMethod === "BankTransfer" ? bankName || null : null,
      description: description || null,
      status: "PENDING",
      createdBy: req.user.id,
    });

    await notify([
      {
        recipientModule: "admin",
        type: "EXPENSE_PENDING_APPROVAL",
        title: "New Expense Pending Approval",
        message: `${req.user.name || "A user"} added a ₹${Number(entry.amount).toLocaleString("en-IN")} expense${entry.customerName ? ` for ${entry.customerName}` : ""} on ${entry.entryDate}, pending your approval.`,
        referenceType: "accountEntry",
        referenceId: entry.id,
        event: "expense_pending_approval",
        payload: { expenseId: entry.id },
      },
    ]);

    return res.status(201).json({ success: true, message: "Expense created successfully", data: serializeExpense(entry) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /expense/:id — Admin only, enforced here (not via the generic canUpdate permission) so a
// custom role can never be granted edit access — see CLAUDE.md's "Edit: Admin only" requirement.
exports.updateExpense = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can edit an expense" });
    }

    const validationError = validateExpensePayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const entry = await AccountEntry.findOne({
      where: { id: req.params.id, entryType: "EXPENSE", category: { [Op.ne]: "Pending Bill" } },
    });
    if (!entry) return res.status(404).json({ success: false, message: "Expense not found" });

    const { customerId, name, mobile, product, amount, entryDate, paymentMethod, bankName, description, status } = req.body;

    const wasApproved = entry.status === "APPROVED";
    const oldDate = entry.entryDate;

    entry.customerId = customerId || null;
    entry.customerName = name.trim();
    entry.customerPhone = mobile || null;
    entry.productName = product || null;
    entry.amount = parseFloat(amount);
    entry.entryDate = entryDate;
    entry.paymentMethod = paymentMethod || null;
    entry.bankName = paymentMethod === "BankTransfer" ? bankName || null : null;
    entry.description = description || null;
    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) entry.status = status;

    await entry.save();

    // Recalculate whichever date(s) could have had their APPROVED total change — either because
    // the entry was already approved (amount/date edit) or the edit just approved/unapproved it.
    if (wasApproved || entry.status === "APPROVED") {
      await recalculateDay(entry.entryDate);
      if (oldDate !== entry.entryDate) await recalculateDay(oldDate);
    }

    return res.status(200).json({ success: true, message: "Expense updated successfully", data: serializeExpense(entry) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /expense/:id — Admin only, enforced here for the same reason as updateExpense above.
exports.deleteExpense = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can delete an expense" });
    }

    const entry = await AccountEntry.findOne({
      where: { id: req.params.id, entryType: "EXPENSE", category: { [Op.ne]: "Pending Bill" } },
    });
    if (!entry) return res.status(404).json({ success: false, message: "Expense not found" });

    const wasApproved = entry.status === "APPROVED";
    const { entryDate } = entry;
    await entry.destroy();
    if (wasApproved) await recalculateDay(entryDate);

    return res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /expense/:id/approve — Admin only. Row-locked inside a transaction so concurrent/duplicate
// approve clicks can never double-count the same entry (mirrors income.controller.js#approveIncome)
// — the second request always observes status already APPROVED and no-ops.
exports.approveExpense = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can approve an expense" });
    }

    const { entry, alreadyApproved } = await sequelize.transaction(async (transaction) => {
      const row = await AccountEntry.findOne({
        where: { id: req.params.id, entryType: "EXPENSE", category: { [Op.ne]: "Pending Bill" } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) return { entry: null };
      if (row.status === "APPROVED") return { entry: row, alreadyApproved: true };

      row.status = "APPROVED";
      await row.save({ transaction });
      return { entry: row, alreadyApproved: false };
    });

    if (!entry) return res.status(404).json({ success: false, message: "Expense not found" });
    if (alreadyApproved) {
      return res.status(200).json({ success: true, message: "Expense is already approved", data: serializeExpense(entry) });
    }

    await recalculateDay(entry.entryDate);

    if (entry.createdBy) {
      await notify([
        {
          recipientModule: "account",
          recipientUserId: entry.createdBy,
          type: "EXPENSE_APPROVED",
          title: "Expense Approved",
          message: `Your ₹${Number(entry.amount).toLocaleString("en-IN")} expense${entry.customerName ? ` for ${entry.customerName}` : ""} was approved.`,
          referenceType: "accountEntry",
          referenceId: entry.id,
          event: "expense_approved",
          payload: { expenseId: entry.id },
        },
      ]);
    }

    return res.status(200).json({ success: true, message: "Expense approved successfully", data: serializeExpense(entry) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /expense/:id/reject — Admin only. Same row-locked/idempotent shape as approveExpense.
// Rejected expenses are excluded from getExpenseTotals/dailyBalance (both only sum APPROVED).
exports.rejectExpense = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can reject an expense" });
    }

    const { entry, alreadyRejected, wasApproved } = await sequelize.transaction(async (transaction) => {
      const row = await AccountEntry.findOne({
        where: { id: req.params.id, entryType: "EXPENSE", category: { [Op.ne]: "Pending Bill" } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) return { entry: null };
      if (row.status === "REJECTED") return { entry: row, alreadyRejected: true };

      const wasApprovedBefore = row.status === "APPROVED";
      row.status = "REJECTED";
      await row.save({ transaction });
      return { entry: row, alreadyRejected: false, wasApproved: wasApprovedBefore };
    });

    if (!entry) return res.status(404).json({ success: false, message: "Expense not found" });
    if (alreadyRejected) {
      return res.status(200).json({ success: true, message: "Expense is already rejected", data: serializeExpense(entry) });
    }

    // Only need to recalc the daily balance if this expense had been counted in it (i.e. was
    // previously APPROVED) — a straight PENDING -> REJECTED transition never affected the total.
    if (wasApproved) await recalculateDay(entry.entryDate);

    if (entry.createdBy) {
      await notify([
        {
          recipientModule: "account",
          recipientUserId: entry.createdBy,
          type: "EXPENSE_REJECTED",
          title: "Expense Rejected",
          message: `Your ₹${Number(entry.amount).toLocaleString("en-IN")} expense${entry.customerName ? ` for ${entry.customerName}` : ""} was rejected.`,
          referenceType: "accountEntry",
          referenceId: entry.id,
          event: "expense_rejected",
          payload: { expenseId: entry.id },
        },
      ]);
    }

    return res.status(200).json({ success: true, message: "Expense rejected successfully", data: serializeExpense(entry) });
  } catch (err) {
    return errorResponse(res, err);
  }
};
