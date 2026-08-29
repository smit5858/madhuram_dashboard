const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const courierController = require("../controllers/courier.controller");

// Route protection: requires login + route-specific capability permission (e.g. read, create, update, delete)
router.get("/", authenticate, authorize("/couriers", "read"), courierController.getCouriers);
router.get("/:id", authenticate, authorize("/couriers", "read"), courierController.getCourierById);
router.post("/", authenticate, authorize("/couriers", "create"), courierController.createCourier);
router.put("/:id", authenticate, authorize("/couriers", "update"), courierController.updateCourier);
router.put("/:id/shipment-type", authenticate, authorize("/couriers", "update"), courierController.updateShipmentType);
router.delete("/:id", authenticate, authorize("/couriers", "delete"), courierController.deleteCourier);

module.exports = router;
