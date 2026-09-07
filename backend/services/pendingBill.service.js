const { PendingBill, PendingBillPayment, AccountEntry } = require("../models");

// Creates the auto-generated purchase bill for a new product (with initial stock) or a restock
// batch, as a billType:"RESTOCK" PendingBill — same table/flow as a manually-entered general
// bill (office rent, etc.), just carrying the extra product/dealer/quantity detail. Called from
// inside the same transaction as the triggering StockMovement — see
// product.controller.js#createProduct and inventory.service.js#receiveStock. Only ever called
// when quantity > 0 (a create/restock with nothing received creates no bill).
//
// amount defaults to quantity * purchasePrice when a purchase price is known; otherwise 0, left
// for the team to fill in later via PUT /pending-bills/:id once the vendor's actual invoice total
// (which may include freight/tax) is known.
const createBillForPurchase = async (
  {
    triggerType,
    productId,
    productNameSnapshot,
    dealerId,
    dealerNameSnapshot,
    quantity,
    purchasePrice,
    totalAmount: totalAmountOverride,
    billDate,
    stockMovementId,
    createdBy,
  },
  { transaction }
) => {
  // totalAmountOverride lets a caller with per-unit prices (e.g. SERIALIZED units, each
  // potentially bought at a different price) sum the real total instead of quantity*purchasePrice.
  const amount =
    totalAmountOverride != null
      ? Number(totalAmountOverride)
      : purchasePrice != null
        ? Number(purchasePrice) * Number(quantity)
        : 0;

  const label = triggerType === "NEW_PRODUCT" ? "New Product" : "Restock";
  const priceNote = purchasePrice != null ? ` @ ₹${Number(purchasePrice).toLocaleString("en-IN")}/unit` : "";

  return PendingBill.create(
    {
      billType: "RESTOCK",
      name: `${label}: ${productNameSnapshot}`,
      dealerName: dealerNameSnapshot ?? null,
      amount,
      billDate: billDate ?? new Date(),
      description: `Auto-generated on ${label.toLowerCase()} — ${quantity} unit(s)${priceNote}.`,
      productId,
      productNameSnapshot,
      dealerId: dealerId ?? null,
      stockMovementId: stockMovementId ?? null,
      quantity,
      purchasePrice: purchasePrice ?? null,
      paidAmount: 0,
      remainingAmount: amount,
      status: "PENDING",
      createdBy: createdBy ?? null,
    },
    { transaction }
  );
};

// Single source of truth for a bill's paidAmount/remainingAmount/status — always recomputed from
// the current set of payment rows, inside the same transaction as whatever mutation triggered it
// (create/verify/reject a payment, or edit the total amount). Never trust a client-sent
// paid/remaining value. Throws if the freshly-summed verified total would exceed the bill's
// amount, which is the authoritative guard against a race between two concurrent verifications.
//
// When the bill crosses into/out of fully-paid ("APPROVED"), also creates/removes the mirrored
// AccountEntry — the same Total Out wiring the old single "Approve" click used to do, just
// triggered automatically by the last verified payment (or an amount edit) instead. `actingUserId`
// is who gets recorded as approvedBy/AccountEntry.createdBy on a becameApproved transition —
// pass the Admin performing the verify (or edit) that caused it; omit for a mutation that can
// never itself cause the transition (e.g. submitting a new payment, which always starts
// "Pending Verification" and so can't push verifiedSum to the total on its own).
const recalculateStatus = async (pendingBillId, { transaction, actingUserId } = {}) => {
  const bill = await PendingBill.findByPk(pendingBillId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!bill) {
    const err = new Error("Pending bill not found");
    err.statusCode = 404;
    throw err;
  }

  const payments = await PendingBillPayment.findAll({ where: { pendingBillId }, transaction });

  const verifiedSum = payments
    .filter((p) => p.status === "Verified")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  if (verifiedSum > Number(bill.amount) + 0.001) {
    const err = new Error("Verified payments cannot exceed the bill's total amount");
    err.statusCode = 409;
    throw err;
  }

  bill.paidAmount = verifiedSum;
  bill.remainingAmount = Number(bill.amount) - verifiedSum;

  const wasApproved = bill.status === "APPROVED";

  if (!["CANCELLED", "REJECTED"].includes(bill.status)) {
    if (verifiedSum >= Number(bill.amount)) {
      bill.status = "APPROVED";
    } else if (payments.some((p) => p.status === "Pending Verification")) {
      bill.status = "PENDING_VERIFICATION";
    } else if (verifiedSum > 0) {
      bill.status = "PARTIALLY_PAID";
    } else {
      bill.status = "PENDING";
    }
  }

  const becameApproved = !wasApproved && bill.status === "APPROVED";
  const noLongerApproved = wasApproved && bill.status !== "APPROVED";

  if (becameApproved) {
    bill.approvedBy = actingUserId ?? null;
    bill.approvedAt = new Date();
  }

  await bill.save({ transaction });

  if (becameApproved) {
    await AccountEntry.create(
      {
        entryType: "EXPENSE",
        category: "Pending Bill",
        description: bill.name,
        amount: bill.amount,
        entryDate: bill.billDate,
        referenceType: "pendingBill",
        referenceId: bill.id,
        status: "APPROVED",
        createdBy: actingUserId ?? bill.createdBy,
      },
      { transaction }
    );
  } else if (noLongerApproved) {
    // The bill's total was edited up after it had already been fully paid — it's no longer
    // fully paid, so it should no longer count in Total Out. See updatePendingBill.
    await AccountEntry.destroy({ where: { referenceType: "pendingBill", referenceId: bill.id }, transaction });
  }

  return { bill, becameApproved, noLongerApproved };
};

module.exports = { createBillForPurchase, recalculateStatus };
