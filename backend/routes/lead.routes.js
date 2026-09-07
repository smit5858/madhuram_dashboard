const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const leadController = require("../controllers/lead.controller");

const ROUTE_PATH = "/leads";

router.get("/stats", authenticate, authorize(ROUTE_PATH, "read"), leadController.getLeadStats);
router.get("/", authenticate, authorize(ROUTE_PATH, "read"), leadController.getLeads);
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), leadController.createLead);
router.get("/:id", authenticate, authorize(ROUTE_PATH, "read"), leadController.getLeadById);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), leadController.updateLead);
router.delete("/:id", authenticate, authorize(ROUTE_PATH, "delete"), leadController.deleteLead);

// Approve/Reject are Admin-only — enforced inline in the controller, independent of the
// generic canUpdate permission (same layering as pendingBill.controller.js's verify/reject).
router.post("/:id/approve", authenticate, leadController.approveLead);
router.post("/:id/reject", authenticate, leadController.rejectLead);

module.exports = router;
