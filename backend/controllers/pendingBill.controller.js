const { PendingBill, AccountEntry, User } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { recalculateDay } = require("../services/dailyBalance.service");
const { notify } = require("../services/notification.service");

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

const CREATOR_INCLUDE = [
  { model: User, as: "creator", attributes: ["id", "name"] },
  { model: User, as: "approver", attributes: ["id", "name"] },
];

const serializePendingBill = (row) => ({
  id: row.id,
  name: row.name,
  dealerName: row.dealerName,
  amount: row.amount,
  billDate: row.billDate,
  description: row.description,
  status: row.status,
  approvedBy: row.approvedBy,
  approvedAt: row.approvedAt,
  creator: row.creator || null,
  approver: row.approver || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const buildPendingBillWhere = (query) => {
  const { search, status, startDate, endDate } = query;
  const where = {};

  if (status && ["PENDING", "APPROVED"].includes(status)) where.status = status;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [{ name: { [Op.like]: term } }, { dealerName: { [Op.like]: term } }];
  }

  if (startDate && endDate) {
    where.billDate = { [Op.between]: [startDate, endDate] };
  } else if (startDate) {
    where.billDate = { [Op.gte]: startDate };
  } else if (endDate) {
    where.billDate = { [Op.lte]: endDate };
  }

  return where;
};

// GET /pending-bills?search=&status=&startDate=&endDate=&page=&limit=
exports.getPendingBills = async (req, res) => {
  try {
    const where = buildPendingBillWhere(req.query);
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await PendingBill.findAndCountAll({
      where,
      include: CREATOR_INCLUDE,
      order: [["billDate", "DESC"], ["createdAt", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    });

    return res.status(200).json({
      success: true,
      data: rows.map(serializePendingBill),
      meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /pending-bills/:id
exports.getPendingBillById = async (req, res) => {
  try {
    const bill = await PendingBill.findByPk(req.params.id, { include: CREATOR_INCLUDE });
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });
    return res.status(200).json({ success: true, data: serializePendingBill(bill) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validatePendingBillPayload = (body) => {
  const { name, amount, billDate } = body || {};
  if (!name || !String(name).trim()) return "Name is required";
  if (amount === undefined || amount === null || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return "A valid amount greater than 0 is required";
  }
  if (!billDate) return "Date is required";
  return null;
};

// POST /pending-bills — any authenticated user with canCreate on /account/pending-bill. Always
// created PENDING — only an Admin approving it later can make it count toward Total Out.
exports.createPendingBill = async (req, res) => {
  try {
    const validationError = validatePendingBillPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const { name, dealerName, amount, billDate, description } = req.body;

    const bill = await PendingBill.create({
      name: name.trim(),
      dealerName: dealerName && String(dealerName).trim() ? dealerName.trim() : null,
      amount: parseFloat(amount),
      billDate,
      description: description || null,
      status: "PENDING",
      createdBy: req.user.id,
    });

    await notify([
      {
        recipientModule: "admin",
        type: "PENDING_BILL_PENDING_APPROVAL",
        title: "New Pending Bill Awaiting Approval",
        message: `${req.user.name || "A user"} added a ₹${Number(bill.amount).toLocaleString("en-IN")} bill (${bill.name})${bill.dealerName ? ` for ${bill.dealerName}` : ""}, pending your approval.`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_created",
        payload: { pendingBillId: bill.id },
      },
    ]);

    return res.status(201).json({ success: true, message: "Pending bill created successfully", data: serializePendingBill(bill) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /pending-bills/:id — gated by canUpdate (Admin and Krina both, per the module's initial
// access grant — see server.js#grantInitialPendingBillAccess). If the bill is already APPROVED,
// the linked AccountEntry is updated in place (never a second entry) so an amount/date change
// only shifts Total Out by the delta once recalculateDay re-sums the affected day(s).
exports.updatePendingBill = async (req, res) => {
  try {
    const validationError = validatePendingBillPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const bill = await PendingBill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });

    const { name, dealerName, amount, billDate, description } = req.body;
    const wasApproved = bill.status === "APPROVED";
    const oldDate = bill.billDate;

    bill.name = name.trim();
    bill.dealerName = dealerName && String(dealerName).trim() ? dealerName.trim() : null;
    bill.amount = parseFloat(amount);
    bill.billDate = billDate;
    bill.description = description || null;

    if (wasApproved) {
      await sequelize.transaction(async (transaction) => {
        await bill.save({ transaction });
        const entry = await AccountEntry.findOne({
          where: { referenceType: "pendingBill", referenceId: bill.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (entry) {
          entry.amount = bill.amount;
          entry.entryDate = bill.billDate;
          entry.description = bill.name;
          await entry.save({ transaction });
        }
      });

      await recalculateDay(bill.billDate);
      if (oldDate !== bill.billDate) await recalculateDay(oldDate);
    } else {
      await bill.save();
    }

    return res.status(200).json({ success: true, message: "Pending bill updated successfully", data: serializePendingBill(bill) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /pending-bills/:id — Admin only, enforced inline (not via canDelete) so only Admin can
// ever remove a bill, matching expense.controller.js#deleteExpense's Admin-only pattern. If the
// bill was APPROVED, its linked AccountEntry is removed first so Total Out reverses correctly.
exports.deletePendingBill = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can delete a pending bill" });
    }

    const bill = await PendingBill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });

    const wasApproved = bill.status === "APPROVED";
    const { billDate } = bill;

    await sequelize.transaction(async (transaction) => {
      if (wasApproved) {
        await AccountEntry.destroy({
          where: { referenceType: "pendingBill", referenceId: bill.id },
          transaction,
        });
      }
      await bill.destroy({ transaction });
    });

    if (wasApproved) await recalculateDay(billDate);

    return res.status(200).json({ success: true, message: "Pending bill deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:id/approve — Admin only. Row-locked inside a transaction so concurrent/
// duplicate approve clicks can never double-count the same bill (mirrors
// expense.controller.js#approveExpense) — a second request always observes status already
// APPROVED and no-ops. The AccountEntry's unique (referenceType, referenceId) index is a second
// line of defense.
exports.approvePendingBill = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can approve a pending bill" });
    }

    const { bill, alreadyApproved } = await sequelize.transaction(async (transaction) => {
      const row = await PendingBill.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) return { bill: null };
      if (row.status === "APPROVED") return { bill: row, alreadyApproved: true };

      await AccountEntry.create(
        {
          entryType: "EXPENSE",
          category: "Pending Bill",
          description: row.name,
          amount: row.amount,
          entryDate: row.billDate,
          referenceType: "pendingBill",
          referenceId: row.id,
          status: "APPROVED",
          createdBy: req.user.id,
        },
        { transaction }
      );

      row.status = "APPROVED";
      row.approvedBy = req.user.id;
      row.approvedAt = new Date();
      await row.save({ transaction });

      return { bill: row, alreadyApproved: false };
    });

    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });
    if (alreadyApproved) {
      return res.status(200).json({ success: true, message: "Pending bill is already approved", data: serializePendingBill(bill) });
    }

    await recalculateDay(bill.billDate);

    if (bill.createdBy) {
      await notify([
        {
          recipientModule: "account",
          recipientUserId: bill.createdBy,
          type: "PENDING_BILL_APPROVED",
          title: "Pending Bill Approved",
          message: `Your ₹${Number(bill.amount).toLocaleString("en-IN")} bill (${bill.name})${bill.dealerName ? ` for ${bill.dealerName}` : ""} was approved.`,
          referenceType: "pendingBill",
          referenceId: bill.id,
          event: "pending_bill_approved",
          payload: { pendingBillId: bill.id },
        },
      ]);
    }

    return res.status(200).json({ success: true, message: "Pending bill approved successfully", data: serializePendingBill(bill) });
  } catch (err) {
    return errorResponse(res, err);
  }
};
