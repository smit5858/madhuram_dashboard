const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const productController = require("../controllers/product.controller");

router.get("/", authenticate, authorize("/products", "read"), productController.getProducts);
// Declared before /:id so "export" is never swallowed by the param route.
router.get("/export", authenticate, authorize("/products", "read"), productController.exportProducts);
router.get("/:id",authenticate, authorize("/products", "read"), productController.getProductById);
router.post("/", authenticate, authorize("/products", "create"), productController.createProduct);
router.put("/:id", authenticate, authorize("/products", "update"), productController.updateProduct);
router.delete("/:id", authenticate, authorize("/products", "delete"), productController.deleteProduct);

module.exports = router;
