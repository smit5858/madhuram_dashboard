const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const inventoryController = require("../controllers/inventory.controller");

router.post("/receive", authenticate, authorize("/inventory", "create"), inventoryController.receiveStock);
router.get("/serials", authenticate, authorize("/inventory", "read"), inventoryController.getSerials);
router.get("/serials/:id", authenticate, authorize("/inventory", "read"), inventoryController.getSerialById);
router.put("/serials/:id", authenticate, authorize("/inventory", "update"), inventoryController.updateSerialStatus);
router.get("/backorders", authenticate, authorize("/inventory", "read"), inventoryController.getBackorders);

module.exports = router;
