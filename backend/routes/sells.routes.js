const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const saleController = require("../controllers/sells.controller");

router.get("/", authenticate, authorize("/sells", "read"), saleController.getSales);
router.post("/", authenticate, authorize("/sells", "create"), saleController.createSale);
router.get("/:id", authenticate, authorize("/sells", "read"), saleController.getSaleById);
router.put("/:id", authenticate, authorize("/sells", "update"), saleController.updateSale);
router.delete("/:id", authenticate, authorize("/sells", "delete"), saleController.deleteSale);

module.exports = router;
