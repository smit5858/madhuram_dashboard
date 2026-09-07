const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const inventoryController = require("../controllers/inventory.controller");

// Inventory has no standalone page/permission — it's the stock-receiving and serial-tracking
// surface embedded in the Products page, so it's gated by the "/products" permission the user
// already needs to be on that page at all (see Products.tsx's inventoryService calls).
router.post("/receive", authenticate, authorize("/products", "create"), inventoryController.receiveStock);
router.get("/serials", authenticate, authorize("/products", "read"), inventoryController.getSerials);
router.get("/serials/:id", authenticate, authorize("/products", "read"), inventoryController.getSerialById);
router.put("/serials/:id", authenticate, authorize("/products", "update"), inventoryController.updateSerialStatus);
router.get("/backorders", authenticate, authorize("/products", "read"), inventoryController.getBackorders);

module.exports = router;
