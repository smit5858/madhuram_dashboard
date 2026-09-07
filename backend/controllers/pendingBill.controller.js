const { PendingBill, PendingBillPayment, AccountEntry, Product, Dealer, User } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { recalculateDay } = require("../services/dailyBalance.service");
const pendingBillService = require("../services/pendingBill.service");
const { notify } = require("../services/notification.service");

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

const BILL_INCLUDE = [
  { model: Product, attributes: ["id", "name"] },
  { model: Dealer, as: "dealer", attributes: ["id", "name"] },
  { model: User, as: "creator", attributes: ["id", "name"] },
  { model: User, as: "approver", attributes: ["id", "name"] },
];

const PAYMENT_INCLUDE = [
  { model: User, as: "creator", attributes: ["id", "name"] },
  { model: User, as: "verifier", attributes: ["id", "name"] },
];

const VALID_STATUSES = ["PENDING", "PARTIALLY_PAID", "PENDING_VERIFICATION", "APPROVED", "REJECTED", "CANCELLED"];
const VALID_PAYMENT_METHODS = ["Cash", "UPI", "Card", "BankTransfer", "Cheque", "Other"];

const serializePendingBill = (row) => ({
  id: row.id,
  billType: row.billType,
  name: row.name,
  dealerName: row.dealerName,
  amount: row.amount,
  billDate: row.billDate,
  description: row.description,
  productId: row.productId,
  product: row.Product || null,
  productNameSnapshot: row.productNameSnapshot,
  dealerId: row.dealerId,
  dealer: row.dealer || null,
  quantity: row.quantity,
  purchasePrice: row.purchasePrice,
  billNumber: row.billNumber,
  paidAmount: row.paidAmount,
  remainingAmount: row.remainingAmount,
  status: row.status,
  approvedBy: row.approvedBy,
  approvedAt: row.approvedAt,
  creator: row.creator || null,
  approver: row.approver || null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  payments: row.payments ? row.payments.map(serializePayment) : undefined,
});

function serializePayment(p) {
  return {
    id: p.id,
    pendingBillId: p.pendingBillId,
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    paymentDate: p.paymentDate,
    transactionRef: p.transactionRef,
    notes: p.notes,
    status: p.status,
    createdBy: p.createdBy,
    creator: p.creator || null,
    verifiedBy: p.verifiedBy,
    verifier: p.verifier || null,
    verifiedAt: p.verifiedAt,
    rejectionReason: p.rejectionReason,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const buildPendingBillWhere = (query) => {
  const { search, status, billType, startDate, endDate } = query;
  const where = {};

  if (status && VALID_STATUSES.includes(status)) where.status = status;
  if (billType && ["GENERAL", "RESTOCK"].includes(billType)) where.billType = billType;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { dealerName: { [Op.like]: term } },
      { billNumber: { [Op.like]: term } },
    ];
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

// GET /pending-bills?search=&status=&billType=&startDate=&endDate=&page=&limit=
exports.getPendingBills = async (req, res) => {
  try {
    const where = buildPendingBillWhere(req.query);
    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await PendingBill.findAndCountAll({
      where,
      include: BILL_INCLUDE,
      order: [["billDate", "DESC"], ["createdAt", "DESC"]],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
      distinct: true,
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
    const bill = await PendingBill.findByPk(req.params.id, {
      include: [
        ...BILL_INCLUDE,
        { model: PendingBillPayment, as: "payments", include: PAYMENT_INCLUDE, separate: true, order: [["createdAt", "ASC"]] },
      ],
    });
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
// created PENDING — only once it's fully paid off (via one or more Admin-verified payments) does
// it count toward Total Out. Manual creation is always billType "GENERAL" — a "RESTOCK" bill is
// only ever auto-created from a product/restock action (see pendingBillService.js).
exports.createPendingBill = async (req, res) => {
  try {
    const validationError = validatePendingBillPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const { name, dealerName, amount, billDate, description } = req.body;
    const parsedAmount = parseFloat(amount);

    const bill = await PendingBill.create({
      billType: "GENERAL",
      name: name.trim(),
      dealerName: dealerName && String(dealerName).trim() ? dealerName.trim() : null,
      amount: parsedAmount,
      billDate,
      description: description || null,
      paidAmount: 0,
      remainingAmount: parsedAmount,
      status: "PENDING",
      createdBy: req.user.id,
    });

    await notify([
      {
        recipientModule: "admin",
        type: "PENDING_BILL_PENDING_APPROVAL",
        title: "New Pending Bill Awaiting Payment",
        message: `${req.user.name || "A user"} added a ₹${Number(bill.amount).toLocaleString("en-IN")} bill (${bill.name})${bill.dealerName ? ` for ${bill.dealerName}` : ""}.`,
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

// PUT /pending-bills/:id — edits name/dealer/amount/date/description/billNumber only, never
// status/paidAmount/remainingAmount directly (those stay derived from verified payments). If the
// amount changes, recalculateStatus re-runs (may flip the bill into/out of fully-paid, syncing
// the linked AccountEntry) and Total Out is re-summed for the affected day(s) afterward.
exports.updatePendingBill = async (req, res) => {
  try {
    const validationError = validatePendingBillPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const bill = await PendingBill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });

    const { name, dealerName, amount, billDate, description, billNumber } = req.body;
    const parsedAmount = parseFloat(amount);

    if (parsedAmount < Number(bill.paidAmount)) {
      return res.status(400).json({
        success: false,
        message: `Amount cannot be less than what's already been verified as paid (₹${bill.paidAmount})`,
      });
    }

    const oldDate = bill.billDate;
    const amountChanged = parsedAmount !== Number(bill.amount);

    bill.name = name.trim();
    bill.dealerName = dealerName && String(dealerName).trim() ? dealerName.trim() : null;
    bill.amount = parsedAmount;
    bill.billDate = billDate;
    bill.description = description || null;
    if (billNumber !== undefined) bill.billNumber = billNumber ? String(billNumber).trim() : null;

    let becameApproved = false;
    let noLongerApproved = false;

    await sequelize.transaction(async (transaction) => {
      await bill.save({ transaction });

      if (amountChanged) {
        ({ becameApproved, noLongerApproved } = await pendingBillService.recalculateStatus(bill.id, {
          transaction,
          actingUserId: req.user.id,
        }));
      } else if (bill.status === "APPROVED") {
        // Not a financial change, but the linked AccountEntry mirrors name/date too.
        const entry = await AccountEntry.findOne({
          where: { referenceType: "pendingBill", referenceId: bill.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (entry) {
          entry.description = bill.name;
          entry.entryDate = bill.billDate;
          await entry.save({ transaction });
        }
      }
    });

    if (bill.status === "APPROVED" || becameApproved || noLongerApproved) {
      await recalculateDay(bill.billDate);
      if (oldDate !== bill.billDate) await recalculateDay(oldDate);
    }

    const refreshed = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({ success: true, message: "Pending bill updated successfully", data: serializePendingBill(refreshed) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /pending-bills/:id — Admin only, enforced inline (not via canDelete). If the bill was
// APPROVED, its linked AccountEntry is removed first so Total Out reverses correctly. Cascades
// its payment history (bill deletion is destructive and Admin-only, so this is safe).
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
      await PendingBillPayment.destroy({ where: { pendingBillId: bill.id }, transaction });
      await bill.destroy({ transaction });
    });

    if (wasApproved) await recalculateDay(billDate);

    return res.status(200).json({ success: true, message: "Pending bill deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:id/cancel — Admin only. Blocked once any payment has already been
// verified (a bill that's already (partially) paid should be handled deliberately, not cancelled
// out from under its payment history).
exports.cancelPendingBill = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can cancel a pending bill" });
    }

    const bill = await PendingBill.findByPk(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: "Pending bill not found" });

    if (Number(bill.paidAmount) > 0) {
      return res.status(400).json({ success: false, message: "Cannot cancel a bill that already has verified payments" });
    }
    if (bill.status === "CANCELLED") {
      return res.status(200).json({ success: true, message: "Pending bill is already cancelled", data: serializePendingBill(bill) });
    }

    bill.status = "CANCELLED";
    await bill.save();

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({ success: true, message: "Pending bill cancelled", data: serializePendingBill(billWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:id/payments — the team records a payment against a bill: either the full
// amount at once, or a custom/partial amount — any number of times. Always created "Pending
// Verification"; only once Admin verifies it does it count toward the paid amount.
exports.createPayment = async (req, res) => {
  try {
    const { amount, paymentMethod, paymentDate, transactionRef, notes } = req.body || {};

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: "A valid amount greater than 0 is required" });
    }
    if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: `paymentMethod must be one of ${VALID_PAYMENT_METHODS.join(", ")}` });
    }
    if (!paymentDate) {
      return res.status(400).json({ success: false, message: "paymentDate is required" });
    }

    const { bill, payment } = await sequelize.transaction(async (transaction) => {
      const row = await PendingBill.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) {
        const err = new Error("Pending bill not found");
        err.statusCode = 404;
        throw err;
      }
      if (["CANCELLED", "APPROVED", "REJECTED"].includes(row.status)) {
        const err = new Error(`Cannot record a payment against a bill with status ${row.status}`);
        err.statusCode = 400;
        throw err;
      }
      if (parsedAmount > Number(row.remainingAmount)) {
        const err = new Error(`Amount exceeds the remaining balance of ₹${row.remainingAmount}`);
        err.statusCode = 400;
        throw err;
      }

      const newPayment = await PendingBillPayment.create(
        {
          pendingBillId: row.id,
          amount: parsedAmount,
          paymentMethod,
          paymentDate,
          transactionRef: transactionRef || null,
          notes: notes || null,
          status: "Pending Verification",
          createdBy: req.user.id,
        },
        { transaction }
      );

      const { bill: updatedBill } = await pendingBillService.recalculateStatus(row.id, { transaction });
      return { bill: updatedBill, payment: newPayment };
    });

    await notify([
      {
        recipientModule: "admin",
        type: "PENDING_BILL_PAYMENT_SUBMITTED",
        title: "Payment Awaiting Verification",
        message: `${req.user.name || "A user"} recorded a ₹${Number(payment.amount).toLocaleString("en-IN")} payment for ${bill.name}, awaiting your verification.`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_payment_submitted",
        payload: { pendingBillId: bill.id, paymentId: payment.id },
      },
    ]);

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(201).json({
      success: true,
      message: "Payment recorded, pending Admin verification",
      data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /pending-bills/:billId/payments/:paymentId — retracting a not-yet-verified submission
// (own submission, or Admin any time before verification). Verified/Rejected rows are permanent
// audit history and can never be deleted.
exports.deletePayment = async (req, res) => {
  try {
    const payment = await PendingBillPayment.findOne({
      where: { id: req.params.paymentId, pendingBillId: req.params.billId },
    });
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    if (payment.status !== "Pending Verification") {
      return res.status(400).json({ success: false, message: "Only a payment still pending verification can be deleted" });
    }
    if (req.user.roleName !== "Admin" && payment.createdBy !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: you can only delete your own unverified payment" });
    }

    await sequelize.transaction(async (transaction) => {
      await payment.destroy({ transaction });
      await pendingBillService.recalculateStatus(req.params.billId, { transaction });
    });

    const billWithIncludes = await PendingBill.findByPk(req.params.billId, { include: BILL_INCLUDE });
    return res.status(200).json({ success: true, message: "Payment deleted", data: serializePendingBill(billWithIncludes) });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:billId/payments/:paymentId/verify — Admin only. Row-locks the bill first,
// then the payment (consistent lock order with createPayment), recomputes status inside the same
// transaction — the authoritative guard against verified payments ever exceeding the bill total.
// If this verification pays the bill off in full, the linked AccountEntry (Total Out) is created
// in the same transaction, same as the old single "Approve" action used to do.
exports.verifyPayment = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can verify a payment" });
    }

    const { bill, payment, alreadyActioned, previousStatus, becameApproved } = await sequelize.transaction(async (transaction) => {
      const billRow = await PendingBill.findByPk(req.params.billId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!billRow) {
        const err = new Error("Pending bill not found");
        err.statusCode = 404;
        throw err;
      }
      const paymentRow = await PendingBillPayment.findOne({
        where: { id: req.params.paymentId, pendingBillId: billRow.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!paymentRow) {
        const err = new Error("Payment not found");
        err.statusCode = 404;
        throw err;
      }
      if (paymentRow.status !== "Pending Verification") {
        return { bill: billRow, payment: paymentRow, alreadyActioned: true };
      }

      const prevStatus = billRow.status;
      paymentRow.status = "Verified";
      paymentRow.verifiedBy = req.user.id;
      paymentRow.verifiedAt = new Date();
      await paymentRow.save({ transaction });

      const { bill: updatedBill, becameApproved: justApproved } = await pendingBillService.recalculateStatus(billRow.id, {
        transaction,
        actingUserId: req.user.id,
      });
      return { bill: updatedBill, payment: paymentRow, alreadyActioned: false, previousStatus: prevStatus, becameApproved: justApproved };
    });

    if (alreadyActioned) {
      const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
      return res.status(200).json({
        success: true,
        message: `Payment is already ${payment.status}`,
        data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
      });
    }

    if (bill.status === "APPROVED" || bill.status === "PARTIALLY_PAID") {
      await recalculateDay(bill.billDate);
    }

    const events = [
      {
        recipientModule: "account",
        recipientUserId: bill.createdBy,
        type: "PENDING_BILL_PAYMENT_VERIFIED",
        title: "Payment Verified",
        message: `Your ₹${Number(payment.amount).toLocaleString("en-IN")} payment for ${bill.name} was verified.`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_payment_verified",
        payload: { pendingBillId: bill.id, paymentId: payment.id },
      },
    ];

    if (bill.status !== previousStatus) {
      if (becameApproved) {
        events.push({
          recipientModule: "account",
          recipientUserId: bill.createdBy,
          type: "PENDING_BILL_APPROVED",
          title: "Pending Bill Fully Paid",
          message: `Your bill (${bill.name}) of ₹${Number(bill.amount).toLocaleString("en-IN")} is now fully paid.`,
          referenceType: "pendingBill",
          referenceId: bill.id,
          event: "pending_bill_approved",
          payload: { pendingBillId: bill.id },
        });
      } else if (bill.status === "PARTIALLY_PAID") {
        events.push({
          recipientModule: "admin",
          type: "PENDING_BILL_PARTIALLY_PAID",
          title: "Pending Bill Partially Paid",
          message: `Bill "${bill.name}" is now Partially Paid. Remaining: ₹${Number(bill.remainingAmount).toLocaleString("en-IN")}.`,
          referenceType: "pendingBill",
          referenceId: bill.id,
          event: "pending_bill_partially_paid",
          payload: { pendingBillId: bill.id },
        });
      }
    }

    await notify(events);

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /pending-bills/:billId/payments/:paymentId/reject — Admin only. rejectionReason required.
exports.rejectPayment = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can reject a payment" });
    }

    const { rejectionReason } = req.body || {};
    if (!rejectionReason || !String(rejectionReason).trim()) {
      return res.status(400).json({ success: false, message: "rejectionReason is required" });
    }

    const { bill, payment, alreadyActioned } = await sequelize.transaction(async (transaction) => {
      const billRow = await PendingBill.findByPk(req.params.billId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!billRow) {
        const err = new Error("Pending bill not found");
        err.statusCode = 404;
        throw err;
      }
      const paymentRow = await PendingBillPayment.findOne({
        where: { id: req.params.paymentId, pendingBillId: billRow.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!paymentRow) {
        const err = new Error("Payment not found");
        err.statusCode = 404;
        throw err;
      }
      if (paymentRow.status !== "Pending Verification") {
        return { bill: billRow, payment: paymentRow, alreadyActioned: true };
      }

      paymentRow.status = "Rejected";
      paymentRow.verifiedBy = req.user.id;
      paymentRow.verifiedAt = new Date();
      paymentRow.rejectionReason = String(rejectionReason).trim();
      await paymentRow.save({ transaction });

      const { bill: updatedBill } = await pendingBillService.recalculateStatus(billRow.id, { transaction });
      return { bill: updatedBill, payment: paymentRow, alreadyActioned: false };
    });

    if (alreadyActioned) {
      const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
      return res.status(200).json({
        success: true,
        message: `Payment is already ${payment.status}`,
        data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
      });
    }

    await notify([
      {
        recipientModule: "account",
        recipientUserId: bill.createdBy,
        type: "PENDING_BILL_PAYMENT_REJECTED",
        title: "Payment Rejected",
        message: `Your ₹${Number(payment.amount).toLocaleString("en-IN")} payment for ${bill.name} was rejected: ${payment.rejectionReason}`,
        referenceType: "pendingBill",
        referenceId: bill.id,
        event: "pending_bill_payment_rejected",
        payload: { pendingBillId: bill.id, paymentId: payment.id },
      },
    ]);

    const billWithIncludes = await PendingBill.findByPk(bill.id, { include: BILL_INCLUDE });
    return res.status(200).json({
      success: true,
      message: "Payment rejected",
      data: { bill: serializePendingBill(billWithIncludes), payment: serializePayment(payment) },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};
