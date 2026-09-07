const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const pendingBillController = require("../controllers/pendingBill.controller");

router.get("/", authenticate, authorize("/account/pending-bill", "read"), pendingBillController.getPendingBills);
router.post("/", authenticate, authorize("/account/pending-bill", "create"), pendingBillController.createPendingBill);
router.get("/:id", authenticate, authorize("/account/pending-bill", "read"), pendingBillController.getPendingBillById);
router.put("/:id", authenticate, authorize("/account/pending-bill", "update"), pendingBillController.updatePendingBill);
// Delete/Approve are Admin-only — enforced inline in the controller, independent of the generic
// canDelete permission (see pendingBill.controller.js).
router.delete("/:id", authenticate, pendingBillController.deletePendingBill);
router.post("/:id/approve", authenticate, pendingBillController.approvePendingBill);

module.exports = router;
