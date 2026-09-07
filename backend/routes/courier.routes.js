const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { requireCourierListAccess } = require("../helper/courierDirectionAuth");
const courierController = require("../controllers/courier.controller");
const courierChargeController = require("../controllers/courierCharge.controller");

// Outgoing and Incoming Courier are independently permissioned (see
// helper/courierDirectionAuth.js) even though they share this one router — list/export gate on
// the requested direction; :id-scoped mutations gate on the fetched record's own direction
// (checked inline in the controller, since the direction isn't known before the fetch).
router.get("/", authenticate, requireCourierListAccess("read"), courierController.getCouriers);
router.get("/export", authenticate, requireCourierListAccess("read"), courierController.exportCouriers);
// Must stay ahead of GET/PUT "/:id" below — otherwise "charge" would be captured as an :id.
// Courier Charge is Outgoing-only by nature (it only ever sums Outgoing, non-free charges).
router.get("/totals", authenticate, authorize("/couriers", "read"), courierController.getCourierTotals);
router.get("/daily-trend", authenticate, authorize("/couriers", "read"), courierController.getCourierDailyTrend);
router.get("/charge", authenticate, authorize("/couriers", "read"), courierChargeController.getCurrentCourierCharge);
router.put("/charge", authenticate, authorize("/couriers", "update"), courierChargeController.setCurrentCourierCharge);
// Role-checked inline in the controller (Admin, or the Courier-role user "Vraj" specifically) —
// independent of canUpdate, same pattern as income.controller.js's update-balance route.
router.put("/charge/reset", authenticate, courierChargeController.resetCurrentCourierCharge);
router.get("/:id", authenticate, courierController.getCourierById);
router.post("/", authenticate, courierController.createCourier);
router.put("/:id", authenticate, courierController.updateCourier);
// Shipment-type splitting only ever applies to Outgoing shipment groups.
router.put("/:id/shipment-type", authenticate, authorize("/couriers", "update"), courierController.updateShipmentType);
router.put("/:id/done", authenticate, authorize("/couriers/incoming", "update"), courierController.completeIncomingCourier);
router.delete("/:id", authenticate, courierController.deleteCourier);

module.exports = router;
