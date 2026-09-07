const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const dealerController = require("../controllers/dealer.controller");

// Dealers has no standalone page/permission — it's the dealer picker/creation surface embedded
// in the Products page (add-product flow), so it's gated by the "/products" permission the user
// already needs to be on that page at all (see Products.tsx's dealerService calls).
router.get("/", authenticate, authorize("/products", "read"), dealerController.getDealers);
router.get("/:id", authenticate, authorize("/products", "read"), dealerController.getDealerById);
router.post("/", authenticate, authorize("/products", "create"), dealerController.createDealer);
router.put("/:id", authenticate, authorize("/products", "update"), dealerController.updateDealer);
router.delete("/:id", authenticate, authorize("/products", "delete"), dealerController.deleteDealer);

module.exports = router;
