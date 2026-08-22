const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const productController = require("../controllers/product.controller");

router.get("/", authenticate, authorize("/sells", "read"), productController.getProducts);
router.get("/:id", authenticate, authorize("/sells", "read"), productController.getProductById);
router.post("/", authenticate, authorize("/sells", "create"), productController.createProduct);
router.put("/:id", authenticate, authorize("/sells", "update"), productController.updateProduct);
router.delete("/:id", authenticate, authorize("/sells", "delete"), productController.deleteProduct);

module.exports = router;
