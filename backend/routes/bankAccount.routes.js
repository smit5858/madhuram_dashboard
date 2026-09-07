const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const bankAccountController = require("../controllers/bankAccount.controller");

// Admin-only module — see server.js#ensureAllRoutesAndPermissions, which never grants any
// role other than Admin access to this route, so authorize() effectively locks every action
// (including read) to Admin.
// Must stay ahead of the plain GET "/" below only in intent, not routing (no conflicting :id
// GET route exists) — kept first for readability, same convention as courier.routes.js#charge.
router.get("/active", authenticate, authorize("/sells", "read"), bankAccountController.getActiveBankAccounts);
router.get("/", authenticate, authorize("/account/bank-accounts", "read"), bankAccountController.getBankAccounts);
router.post("/", authenticate, authorize("/account/bank-accounts", "create"), bankAccountController.createBankAccount);
router.put("/:id", authenticate, authorize("/account/bank-accounts", "update"), bankAccountController.updateBankAccount);
router.delete("/:id", authenticate, authorize("/account/bank-accounts", "delete"), bankAccountController.deleteBankAccount);

module.exports = router;
