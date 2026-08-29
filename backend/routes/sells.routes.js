const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const saleController = require("../controllers/sells.controller");

router.get("/", authenticate, authorize("/sells", "read"), saleController.getSales);
router.get("/totals", authenticate, authorize("/sells", "read"), saleController.getSellsTotals);
router.get("/payments", authenticate, authorize("/sells", "read"), saleController.getAllPayments);
router.post("/", authenticate, authorize("/sells", "create"), saleController.createSale);
router.get("/:id", authenticate, authorize("/sells", "read"), saleController.getSaleById);
router.put("/:id", authenticate, authorize("/sells", "update"), saleController.updateSale);
router.delete("/:id", authenticate, authorize("/sells", "delete"), saleController.deleteSale);

router.get("/:id/payments", authenticate, authorize("/sells", "read"), saleController.getPayments);
router.post("/:id/payments", authenticate, authorize("/sells", "update"), saleController.recordPayment);
router.post("/:id/items/:itemId/return", authenticate, authorize("/sells", "update"), saleController.returnOrderItem);
router.post("/:id/items/:itemId/cancel", authenticate, authorize("/sells", "update"), saleController.cancelOrderItem);

module.exports = router;
