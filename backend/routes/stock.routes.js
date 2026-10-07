const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const stockAccess = require("../middlewares/stockAccess");
const authorize = require("../middlewares/authorize");
const stockController = require("../controllers/stock.controller");

// router.get("/", authenticate, authorize("/stock", "read"), stockController.getStock);
router.get("/", stockAccess, stockController.getStock);
router.put("/:productId/adjust", authenticate, authorize("/stock", "update"), stockController.adjustStock);
router.get("/:productId/movements", authenticate, authorize("/stock", "read"), stockController.getStockMovements);

module.exports = router;
