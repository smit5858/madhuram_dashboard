const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const requireProductType = require("../middlewares/requireProductType");
const productController = require("../controllers/product.controller");

// Software page: same product handlers as /products, but guarded by the "/software" permission
// and limited to SOFTWARE products only.
const softwareOnly = requireProductType("SOFTWARE");

router.get("/", authenticate, authorize("/software", "read"), productController.getSoftwareProducts);
router.get("/:id", authenticate, authorize("/software", "read"), softwareOnly, productController.getProductById);
router.post("/", authenticate, authorize("/software", "create"), softwareOnly, productController.createProduct);
router.put("/:id", authenticate, authorize("/software", "update"), softwareOnly, productController.updateProduct);
router.delete("/:id", authenticate, authorize("/software", "delete"), softwareOnly, productController.deleteProduct);

module.exports = router;
