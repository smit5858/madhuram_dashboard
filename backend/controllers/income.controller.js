const { AccountEntry, DailyAccountBalance, User } = require("../models");
const { Op } = require("sequelize");
const dayjs = require("dayjs");
const sequelize = require("../config/db");
const { checkPassword } = require("../helper/common");
const { recalculateDay, getPreviousClosing } = require("../services/dailyBalance.service");

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

/**
 * Shared filter builder for the Income list + totals endpoints, so they can never diverge.
 * entryType is always locked to INCOME here — Expense keeps its own read/write path in
 * expense.controller.js untouched.
 */
const buildIncomeWhere = (query) => {
  const { search, paymentMethod, startDate, endDate } = query;
  const where = { entryType: "INCOME" };

  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { customerName: { [Op.like]: term } },
      { customerPhone: { [Op.like]: term } },
      { productName: { [Op.like]: term } },
    ];
  }
  if (startDate || endDate) {
    where.entryDate = {};
    if (startDate) where.entryDate[Op.gte] = startDate;
    if (endDate) where.entryDate[Op.lte] = endDate;
  }

  return where;
};

// GET /income?search=&paymentMethod=&startDate=&endDate=&page=&limit=
exports.getIncomeEntries = async (req, res) => {
  try {
    const where = buildIncomeWhere(req.query);
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
      data: rows,
      meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /income/totals — aggregate over the same filtered dataset as the list, never just the
// current page. Approved-only, mirrors expense.controller.js#getExpenseTotals — a Pending
// Selling entry must not count toward Total Income until an Admin approves it.
exports.getIncomeTotals = async (req, res) => {
  try {
    const where = { ...buildIncomeWhere(req.query), status: "APPROVED" };
    const result = await AccountEntry.findOne({
      where,
      attributes: [
        [sequelize.fn("SUM", sequelize.col("amount")), "totalIncome"],
        [sequelize.fn("COUNT", sequelize.col("id")), "totalCount"],
      ],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: {
        totalIncome: parseFloat(result?.totalIncome) || 0,
        totalCount: parseInt(result?.totalCount, 10) || 0,
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /income/daily-balances?page=&limit=
// GET /income/daily-balances?startDate=&endDate= — unpaginated, ascending, for the Accounts
// dashboard trend chart (1W-5Y range buttons). The page/limit form stays untouched for the
// existing Income page's daily-balance table.
exports.getDailyBalances = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (startDate || endDate) {
      const where = {};
      if (startDate) where.date = { ...where.date, [Op.gte]: startDate };
      if (endDate) where.date = { ...where.date, [Op.lte]: endDate };

      const rows = await DailyAccountBalance.findAll({ where, order: [["date", "ASC"]] });

      return res.status(200).json({
        success: true,
        data: rows,
        meta: { page: 1, limit: rows.length, total: rows.length, totalPages: 1 },
      });
    }

    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await DailyAccountBalance.findAndCountAll({
      order: [["date", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /income/:id
exports.getIncomeById = async (req, res) => {
  try {
    const entry = await AccountEntry.findOne({
      where: { id: req.params.id, entryType: "INCOME" },
      include: [{ model: User, as: "creator", attributes: ["id", "name"] }],
    });
    if (!entry) return res.status(404).json({ success: false, message: "Income record not found" });
    return res.status(200).json({ success: true, data: entry });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validateIncomePayload = (body) => {
  const { customerName, amount, entryDate } = body || {};
  if (!customerName || !String(customerName).trim()) return "Customer name is required";
  if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return "A valid amount greater than 0 is required";
  }
  if (!entryDate) return "Transaction date is required";
  return null;
};

// POST /income
exports.createIncomeEntry = async (req, res) => {
  try {
    const validationError = validateIncomePayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const {
      customerId, customerName, customerPhone, productName, serialNumber,
      amount, entryDate, paymentMethod, bankName, description,
    } = req.body;

    const entry = await AccountEntry.create({
      entryType: "INCOME",
      category: "Income",
      customerId: customerId || null,
      customerName: customerName.trim(),
      customerPhone: customerPhone || null,
      productName: productName || null,
      serialNumber: serialNumber || null,
      amount: parseFloat(amount),
      entryDate,
      paymentMethod: paymentMethod || null,
      bankName: paymentMethod === "BankTransfer" ? bankName || null : null,
      description: description || null,
      createdBy: req.user.id,
    });

    await recalculateDay(entryDate);

    return res.status(201).json({ success: true, message: "Income record created successfully", data: entry });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /income/:id
exports.updateIncomeEntry = async (req, res) => {
  try {
    const validationError = validateIncomePayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const entry = await AccountEntry.findOne({ where: { id: req.params.id, entryType: "INCOME" } });
    if (!entry) return res.status(404).json({ success: false, message: "Income record not found" });

    const {
      customerId, customerName, customerPhone, productName, serialNumber,
      amount, entryDate, paymentMethod, bankName, description,
    } = req.body;

    const oldDate = entry.entryDate;

    entry.customerId = customerId || null;
    entry.customerName = customerName.trim();
    entry.customerPhone = customerPhone || null;
    entry.productName = productName || null;
    entry.serialNumber = serialNumber || null;
    entry.amount = parseFloat(amount);
    entry.entryDate = entryDate;
    entry.paymentMethod = paymentMethod || null;
    entry.bankName = paymentMethod === "BankTransfer" ? bankName || null : null;
    entry.description = description || null;

    await entry.save();

    await recalculateDay(entryDate);
    if (oldDate !== entryDate) await recalculateDay(oldDate);

    return res.status(200).json({ success: true, message: "Income record updated successfully", data: entry });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /income/:id
exports.deleteIncomeEntry = async (req, res) => {
  try {
    const entry = await AccountEntry.findOne({ where: { id: req.params.id, entryType: "INCOME" } });
    if (!entry) return res.status(404).json({ success: false, message: "Income record not found" });

    const { entryDate } = entry;
    await entry.destroy();
    await recalculateDay(entryDate);

    return res.status(200).json({ success: true, message: "Income record deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /income/update-balance — body: { password, date?, closingBalance }
// Admin or Account role only (checked here, independent of the generic canUpdate permission,
// since Account is deliberately barred from editing individual Income records but is still
// allowed to perform this balance-correction action).
exports.updateBalance = async (req, res) => {
  try {
    const roleName = req.user.roleName;
    if (roleName !== "Admin" && roleName !== "Account") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin or Account can update the balance" });
    }

    const { password, date, closingBalance } = req.body || {};
    if (!password) return res.status(400).json({ success: false, message: "Password is required" });
    if (closingBalance === undefined || closingBalance === null || isNaN(parseFloat(closingBalance))) {
      return res.status(400).json({ success: false, message: "A valid balance amount is required" });
    }

    const user = await User.findByPk(req.user.id, { attributes: ["id", "password"] });
    if (!user || !checkPassword(password, user.password)) {
      return res.status(401).json({ success: false, message: "Incorrect password" });
    }

    const targetDate = date || dayjs().format("YYYY-MM-DD");
    const opening = await getPreviousClosing(targetDate);

    const existing = await DailyAccountBalance.findOne({ where: { date: targetDate } });
    const currentTotalIn = existing ? parseFloat(existing.totalIn) : 0;
    const currentTotalOut = existing ? parseFloat(existing.totalOut) : 0;
    const currentClosing = opening + currentTotalIn - currentTotalOut;

    const requestedClosing = parseFloat(closingBalance);
    const diff = Math.round((requestedClosing - currentClosing) * 100) / 100;

    if (diff !== 0) {
      await AccountEntry.create({
        entryType: diff > 0 ? "INCOME" : "EXPENSE",
        category: "Balance Adjustment",
        description: `Manual balance correction by ${req.user.name || "user"}`,
        amount: Math.abs(diff),
        entryDate: targetDate,
        createdBy: req.user.id,
      });
      await recalculateDay(targetDate);
    }

    const updated = await DailyAccountBalance.findOne({ where: { date: targetDate } });

    return res.status(200).json({ success: true, message: "Balance updated successfully", data: updated });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /income/:id/approve — Admin only, enforced inline (not via the generic canUpdate
// permission), same as expense.controller.js#approveExpense. A Selling entry only starts
// counting toward Total Income / the daily balance's Total In once approved here.
// Row-locked inside a transaction so concurrent/duplicate approve clicks can never double-count
// the same entry — the second request always observes status already APPROVED and no-ops.
exports.approveIncome = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can approve a selling entry" });
    }

    const { entry, alreadyApproved } = await sequelize.transaction(async (transaction) => {
      const row = await AccountEntry.findOne({
        where: { id: req.params.id, entryType: "INCOME" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) return { entry: null };
      if (row.status === "APPROVED") return { entry: row, alreadyApproved: true };

      row.status = "APPROVED";
      await row.save({ transaction });
      return { entry: row, alreadyApproved: false };
    });

    if (!entry) return res.status(404).json({ success: false, message: "Income record not found" });
    if (alreadyApproved) {
      return res.status(200).json({ success: true, message: "Selling entry is already approved", data: entry });
    }

    await recalculateDay(entry.entryDate);

    return res.status(200).json({ success: true, message: "Selling entry approved successfully", data: entry });
  } catch (err) {
    return errorResponse(res, err);
  }
};
