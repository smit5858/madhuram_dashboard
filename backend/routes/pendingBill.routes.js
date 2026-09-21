const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const pendingBillController = require("../controllers/pendingBill.controller");

const ROUTE_PATH = "/account/pending-bill";

router.get("/", authenticate, authorize(ROUTE_PATH, "read"), pendingBillController.getPendingBills);
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), pendingBillController.createPendingBill);

// Accounts — one per Seller/Dealer/Company, the main Pending Bill list and its Account Details
// page (see pendingBill.controller.js). Declared before "/:id" so "accounts" isn't read as an id.
router.get("/accounts", authenticate, authorize(ROUTE_PATH, "read"), pendingBillController.getPendingBillAccounts);
router.get("/accounts/:accountKey", authenticate, authorize(ROUTE_PATH, "read"), pendingBillController.getPendingBillAccount);
router.post("/accounts/:accountKey/payments", authenticate, authorize(ROUTE_PATH, "create"), pendingBillController.createAccountPayment);

router.get("/:id", authenticate, authorize(ROUTE_PATH, "read"), pendingBillController.getPendingBillById);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), pendingBillController.updatePendingBill);
// Delete/Cancel/Verify/Reject are Admin-only — enforced inline in the controller, independent of
// the generic canDelete permission (see pendingBill.controller.js).
router.delete("/:id", authenticate, pendingBillController.deletePendingBill);
router.post("/:id/cancel", authenticate, pendingBillController.cancelPendingBill);

// Payment against one specific bill (full or custom/partial amount) — takes effect immediately and
// creates its own linked Expense. Delete/verify/reject only apply to payments recorded under the
// old submit-then-verify flow; they're gated inline in the controller (own not-yet-verified
// submission, or Admin) rather than via canDelete, since an accountant retracting their own
// mistaken entry isn't a "delete" permission.
router.post("/:id/payments", authenticate, authorize(ROUTE_PATH, "create"), pendingBillController.createPayment);
router.delete("/:billId/payments/:paymentId", authenticate, pendingBillController.deletePayment);
router.post("/:billId/payments/:paymentId/verify", authenticate, pendingBillController.verifyPayment);
router.post("/:billId/payments/:paymentId/reject", authenticate, pendingBillController.rejectPayment);

module.exports = router;
