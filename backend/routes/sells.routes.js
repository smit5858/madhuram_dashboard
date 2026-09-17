const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const authorizeAnyAction = require("../middlewares/authorizeAnyAction");
const saleController = require("../controllers/sells.controller");

router.get("/", authenticate, authorize("/sells", "read"), saleController.getSales);
router.get("/export", authenticate, authorize("/sells", "read"), saleController.exportSales);
router.get("/totals", authenticate, authorize("/sells", "read"), saleController.getSellsTotals);
router.get("/daily-trend", authenticate, authorize("/sells", "read"), saleController.getSalesDailyTrend);
// Reachable from both the new-sale form (needs "create") and an existing sale's edit form (needs
// "update") — see quickAddProduct's controller comment.
router.post("/quick-add-product", authenticate, authorizeAnyAction("/sells", ["create", "update"]), saleController.quickAddProduct);
router.post("/", authenticate, authorize("/sells", "create"), saleController.createSale);
router.get("/:id", authenticate, authorize("/sells", "read"), saleController.getSaleById);
router.put("/:id", authenticate, authorize("/sells", "update"), saleController.updateSale);
router.delete("/:id", authenticate, authorize("/sells", "delete"), saleController.deleteSale);

router.get("/:id/payments", authenticate, authorize("/sells", "read"), saleController.getPayments);
router.post("/:id/payments", authenticate, authorize("/sells", "update"), saleController.recordPayment);
router.put("/:id/payments/:paymentId", authenticate, authorize("/sells", "update"), saleController.updatePayment);
router.delete("/:id/payments/:paymentId", authenticate, authorize("/sells", "update"), saleController.deletePayment);
router.post("/:id/items", authenticate, authorize("/sells", "update"), saleController.addSaleItem);
router.put("/:id/items/:itemId", authenticate, authorize("/sells", "update"), saleController.updateSaleItem);
router.post("/:id/items/:itemId/return", authenticate, authorize("/sells", "update"), saleController.returnOrderItem);
router.post("/:id/items/:itemId/cancel", authenticate, authorize("/sells", "update"), saleController.cancelOrderItem);

module.exports = router;
