const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const pendingBillController = require("../controllers/pendingBill.controller");

const ROUTE_PATH = "/account/pending-bill";

router.get("/", authenticate, authorize(ROUTE_PATH, "read"), pendingBillController.getPendingBills);
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), pendingBillController.createPendingBill);
router.get("/:id", authenticate, authorize(ROUTE_PATH, "read"), pendingBillController.getPendingBillById);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), pendingBillController.updatePendingBill);
// Delete/Cancel/Verify/Reject are Admin-only — enforced inline in the controller, independent of
// the generic canDelete permission (see pendingBill.controller.js).
router.delete("/:id", authenticate, pendingBillController.deletePendingBill);
router.post("/:id/cancel", authenticate, pendingBillController.cancelPendingBill);

// Payment history — the team records a payment (full or custom/partial amount) here; each one
// needs its own Admin verification before it counts toward the paid amount. Delete/verify/reject
// are gated inline in the controller (own not-yet-verified submission, or Admin) rather than via
// canDelete, since an accountant retracting their own mistaken entry isn't a "delete" permission.
router.post("/:id/payments", authenticate, authorize(ROUTE_PATH, "create"), pendingBillController.createPayment);
router.delete("/:billId/payments/:paymentId", authenticate, pendingBillController.deletePayment);
router.post("/:billId/payments/:paymentId/verify", authenticate, pendingBillController.verifyPayment);
router.post("/:billId/payments/:paymentId/reject", authenticate, pendingBillController.rejectPayment);

module.exports = router;
