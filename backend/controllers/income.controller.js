const { AccountEntry, DailyAccountBalance, User, BankAccount, Sale, Courier, SaleItem, Product, SerialUnit } = require("../models");
const { Op } = require("sequelize");
const dayjs = require("dayjs");
const sequelize = require("../config/db");
const { checkPassword } = require("../helper/common");
const { recalculateDay, getPreviousClosing } = require("../services/dailyBalance.service");

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

// BankTransfer/UPI need a configured bank account named ("Select Bank") — matches
// order.service.js#needsBankSplit's same two methods.
const needsBankAccount = (paymentMethod) => paymentMethod === "BankTransfer" || paymentMethod === "UPI";
const BANK_ACCOUNT_INCLUDE = { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] };

/**
 * Attaches the linked Sale's own Notes (Sale.notes, entered by the sales employee on the Sell
 * form) to each sale-linked INCOME row as a read-only `saleNotes` field, for display in
 * IncomeViewModal. AccountEntry has no real FK to Sale (only the loose referenceType/referenceId
 * pair — see accountEntry.model.js), so this is a separate lookup rather than a Sequelize
 * include, and deliberately doesn't touch AccountEntry.description, which stays the accountant's
 * own independently-editable Notes field on the Income entry itself.
 */
const attachSaleNotes = async (rows) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const saleIds = [...new Set(list.filter((r) => r.referenceType === "sale" && r.referenceId).map((r) => r.referenceId))];
  if (saleIds.length === 0) return;

  const sales = await Sale.findAll({ where: { id: saleIds }, attributes: ["id", "notes"] });
  const notesById = new Map(sales.map((s) => [s.id, s.notes]));
  for (const r of list) {
    if (r.referenceType === "sale" && r.referenceId) {
      r.dataValues.saleNotes = notesById.get(r.referenceId) || null;
    }
  }
};

/**
 * Attaches the linked Outgoing Courier's status (Courier.status, e.g. "Pending", "Out for
 * Delivery", "Done") to each courier-linked INCOME row as a read-only `courierStatus` field, for
 * the Income list's "Courier" column. Same loose referenceType/referenceId lookup pattern as
 * attachSaleNotes above. Two kinds of rows carry a courier link:
 *  - referenceType "sale": auto-created by a Sale (see incomeSync.service.js#createIncomeForSale)
 *    — a sale can have more than one Courier row (e.g. a split "Ship Available Products"
 *    shipment), so the earliest-created OUT-direction one is shown, since that's the original
 *    shipment for the order.
 *  - referenceType "courier": auto-created by a manually-added Outgoing Courier (see
 *    incomeSync.service.js#createIncomeForCourier) — referenceId IS the Courier row's own id,
 *    resolved directly rather than via saleId.
 */
const attachCourierStatus = async (rows) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const saleIds = [...new Set(list.filter((r) => r.referenceType === "sale" && r.referenceId).map((r) => r.referenceId))];
  const courierIds = [...new Set(list.filter((r) => r.referenceType === "courier" && r.referenceId).map((r) => r.referenceId))];
  if (saleIds.length === 0 && courierIds.length === 0) return;

  const [saleLinkedCouriers, directCouriers] = await Promise.all([
    saleIds.length
      ? Courier.findAll({ where: { saleId: saleIds, direction: "OUT" }, attributes: ["saleId", "status"], order: [["id", "ASC"]] })
      : [],
    courierIds.length ? Courier.findAll({ where: { id: courierIds }, attributes: ["id", "status"] }) : [],
  ]);

  const statusBySale = new Map();
  for (const c of saleLinkedCouriers) {
    if (!statusBySale.has(c.saleId)) statusBySale.set(c.saleId, c.status);
  }
  const statusByCourierId = new Map(directCouriers.map((c) => [c.id, c.status]));

  for (const r of list) {
    if (r.referenceType === "sale" && r.referenceId) {
      r.dataValues.courierStatus = statusBySale.get(r.referenceId) || null;
    } else if (r.referenceType === "courier" && r.referenceId) {
      r.dataValues.courierStatus = statusByCourierId.get(r.referenceId) || null;
    }
  }
};

/**
 * Overrides each sale-linked INCOME row's productName/serialNumber with a fresh summary built
 * live from the Sale's CURRENT SaleItems/SerialUnits, instead of trusting the frozen snapshot
 * AccountEntry.productName/serialNumber written once at Sale-creation time (see
 * incomeSync.service.js#buildSaleProductSummary). That snapshot never gets refreshed when items
 * are added/edited on the Sale after the fact (sells.controller.js#addSaleItem/updateSaleItem
 * don't touch it) and, being a STRING column historically capped at 255 chars, could also
 * truncate a long multi-product list — both of which show up as "missing products" on the Income
 * table/view. Computing it live here, the same way attachSaleNotes/attachCourierStatus above
 * already do for other sale-derived fields, fixes both old and newly-created entries with no
 * backfill needed.
 */
const attachSaleProducts = async (rows) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const saleIds = [...new Set(list.filter((r) => r.referenceType === "sale" && r.referenceId).map((r) => r.referenceId))];
  if (saleIds.length === 0) return;

  const items = await SaleItem.findAll({
    where: { saleId: saleIds },
    include: [{ model: Product, attributes: ["id", "name"] }],
    order: [["id", "ASC"]],
  });

  const itemsBySale = new Map();
  for (const item of items) {
    if (!itemsBySale.has(item.saleId)) itemsBySale.set(item.saleId, []);
    itemsBySale.get(item.saleId).push(item);
  }

  const saleItemIds = items.map((i) => i.id);
  const units = saleItemIds.length
    ? await SerialUnit.findAll({
        where: { saleItemId: { [Op.in]: saleItemIds }, status: { [Op.in]: ["RESERVED", "SOLD"] } },
        attributes: ["saleItemId", "serialNumber"],
      })
    : [];
  const unitsByItem = new Map();
  for (const u of units) {
    if (!unitsByItem.has(u.saleItemId)) unitsByItem.set(u.saleItemId, []);
    unitsByItem.get(u.saleItemId).push(u.serialNumber);
  }

  for (const r of list) {
    if (r.referenceType !== "sale" || !r.referenceId) continue;
    const saleItems = itemsBySale.get(r.referenceId);
    if (!saleItems) continue; // sale has no items (or was hard-deleted) — keep the stored fallback
    r.dataValues.productName = saleItems.map((i) => `${i.Product?.name || "Item"} x${i.quantity}`).join(", ") || null;
    const serials = saleItems.flatMap((i) => unitsByItem.get(i.id) || []);
    r.dataValues.serialNumber = serials.join(", ") || null;
  }
};

/**
 * Shared filter builder for the Income list + totals endpoints, so they can never diverge.
 * entryType is always locked to INCOME here — Expense keeps its own read/write path in
 * expense.controller.js untouched.
 */
const buildIncomeWhere = (query) => {
  const { search, paymentMethod, startDate, endDate, status } = query;
  const where = { entryType: "INCOME" };

  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (status && ["PENDING", "APPROVED"].includes(status)) where.status = status;
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
      include: [{ model: User, as: "creator", attributes: ["id", "name"] }, BANK_ACCOUNT_INCLUDE],
      order: [["entryDate", "DESC"], ["createdAt", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    });

    await attachSaleNotes(rows);
    await attachCourierStatus(rows);
    await attachSaleProducts(rows);

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
      include: [{ model: User, as: "creator", attributes: ["id", "name"] }, BANK_ACCOUNT_INCLUDE],
    });
    if (!entry) return res.status(404).json({ success: false, message: "Income record not found" });
    await attachSaleNotes(entry);
    await attachSaleProducts(entry);
    return res.status(200).json({ success: true, data: entry });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validateIncomePayload = (body) => {
  const { customerName, amount, entryDate, paymentMethod, bankAccountId } = body || {};
  if (!customerName || !String(customerName).trim()) return "Customer name is required";
  if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return "A valid amount greater than 0 is required";
  }
  if (!entryDate) return "Transaction date is required";
  if (needsBankAccount(paymentMethod) && !bankAccountId) return "Select a bank account for this payment method";
  return null;
};

// POST /income — always created PENDING (never trusts a status from the body), same as
// expense.controller.js#createExpense. Only an Admin approving it (see approveIncome below) makes
// it count toward Total Income / the daily balance's Total In, so no recalculateDay is needed here.
exports.createIncomeEntry = async (req, res) => {
  try {
    const validationError = validateIncomePayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const {
      customerId, customerName, customerPhone, productName, serialNumber,
      amount, entryDate, paymentMethod, bankAccountId, description,
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
      bankAccountId: needsBankAccount(paymentMethod) ? bankAccountId || null : null,
      description: description || null,
      status: "PENDING",
      createdBy: req.user.id,
    });

    const withBank = await AccountEntry.findByPk(entry.id, { include: [BANK_ACCOUNT_INCLUDE] });

    return res.status(201).json({ success: true, message: "Income record created successfully", data: withBank });
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
      amount, entryDate, paymentMethod, bankAccountId, description,
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
    entry.bankAccountId = needsBankAccount(paymentMethod) ? bankAccountId || null : null;
    entry.description = description || null;
    // A non-Admin editing an already-approved entry sends it back for re-approval, so an
    // approved amount can never be changed without an Admin signing off on it again.
    if (req.user.roleName !== "Admin" && entry.status === "APPROVED") entry.status = "PENDING";

    await entry.save();

    await recalculateDay(entryDate);
    if (oldDate !== entryDate) await recalculateDay(oldDate);

    const withBank = await AccountEntry.findByPk(entry.id, { include: [BANK_ACCOUNT_INCLUDE] });

    return res.status(200).json({ success: true, message: "Income record updated successfully", data: withBank });
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
