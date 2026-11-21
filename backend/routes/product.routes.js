const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const productController = require("../controllers/product.controller");
const { MAX_IMAGE_BYTES } = require("../services/productImage.service");

router.get("/", authenticate, authorize("/products", "read"), productController.getProducts);
// Declared before /:id so "export" is never swallowed by the param route.
router.get("/export", authenticate, authorize("/products", "read"), productController.exportProducts);
router.get("/:id/share.pdf", authenticate, authorize("/products", "read"), productController.getProductSharePdf);

// Product photos (stored in the DB, up to 4 per product) — uploads are a raw binary body (image/jpeg
// or image/png; no multipart dependency), one photo per request. The real type is re-checked by
// magic bytes in productImage.service.js. Oversized bodies get a JSON 413 instead of Express's
// default HTML error page.
const rawImageBody = (req, res, next) =>
  express.raw({ type: ["image/jpeg", "image/png"], limit: MAX_IMAGE_BYTES })(req, res, (err) => {
    if (err) return res.status(err.status || 400).json({ success: false, message: err.type === "entity.too.large" ? "Image must be 5 MB or smaller" : err.message });
    return next();
  });
router.get("/:id/images/:imageId", authenticate, authorize("/products", "read"), productController.getProductImage);
router.post("/:id/images", authenticate, authorize("/products", "update"), rawImageBody, productController.uploadProductImage);
router.put("/:id/images/:imageId/cover", authenticate, authorize("/products", "update"), productController.setProductCoverImage);
router.delete("/:id/images/:imageId", authenticate, authorize("/products", "update"), productController.deleteProductImage);
router.get("/:id",authenticate, authorize("/products", "read"), productController.getProductById);
router.post("/", authenticate, authorize("/products", "create"), productController.createProduct);
router.put("/:id", authenticate, authorize("/products", "update"), productController.updateProduct);
router.delete("/:id", authenticate, authorize("/products", "delete"), productController.deleteProduct);

module.exports = router;
