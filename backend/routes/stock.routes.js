const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const stockController = require("../controllers/stock.controller");

router.get("/", authenticate, authorize("/sells", "read"), stockController.getStock);
router.put("/:productId/adjust", authenticate, authorize("/sells", "update"), stockController.adjustStock);
router.get("/:productId/movements", authenticate, authorize("/sells", "read"), stockController.getStockMovements);

module.exports = router;
