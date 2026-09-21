const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const timesheetController = require("../controllers/timesheet.controller");

const ROUTE_PATH = "/timesheets";

// Fixed paths first — they must not be swallowed by "/:id".
router.get("/", authenticate, authorize(ROUTE_PATH, "read"), timesheetController.getTimesheets);
router.get("/summary", authenticate, authorize(ROUTE_PATH, "read"), timesheetController.getTimesheetSummary);
router.get("/options", authenticate, authorize(ROUTE_PATH, "read"), timesheetController.getTimesheetOptions);
router.get("/activity", authenticate, authorize(ROUTE_PATH, "read"), timesheetController.getTimesheetActivity);
// Anyone with create access logs their own hours; update/delete are Admin-only — enforced in the
// controller too, so a stray canUpdate/canDelete grant on a non-Admin never opens them up.
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), timesheetController.createTimesheet);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), timesheetController.updateTimesheet);
router.delete("/:id", authenticate, authorize(ROUTE_PATH, "delete"), timesheetController.deleteTimesheet);

module.exports = router;
