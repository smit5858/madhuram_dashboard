const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const dealerController = require("../controllers/dealer.controller");

router.get("/", authenticate, authorize("/dealers", "read"), dealerController.getDealers);
router.get("/:id", authenticate, authorize("/dealers", "read"), dealerController.getDealerById);
router.post("/", authenticate, authorize("/dealers", "create"), dealerController.createDealer);
router.put("/:id", authenticate, authorize("/dealers", "update"), dealerController.updateDealer);
router.delete("/:id", authenticate, authorize("/dealers", "delete"), dealerController.deleteDealer);

module.exports = router;
