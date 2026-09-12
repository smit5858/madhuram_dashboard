const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const authorizeAny = require("../middlewares/authorizeAny");
const customerController = require("../controllers/customer.controller");
const customerLedgerController = require("../controllers/customerLedger.controller");

router.get("/", authenticate, authorize("/customers", "read"), customerController.getCustomers);
router.get("/phone/:phone", authenticate, authorize("/customers", "read"), customerController.getCustomerByPhone);
// Must come before "/:id" — otherwise Express would match "debtors" as the :id param.
router.get("/debtors", authenticate, authorize("/account/debited", "read"), customerLedgerController.getDebtors);
router.get("/debtors/totals", authenticate, authorize("/account/debited", "read"), customerLedgerController.getReceivableTotals);
router.get("/:id", authenticate, authorize("/customers", "read"), customerController.getCustomerById);
router.post("/", authenticate, authorize("/customers", "create"), customerController.createCustomer);
router.put("/:id", authenticate, authorize("/customers", "update"), customerController.updateCustomer);
router.delete("/:id", authenticate, authorize("/customers", "delete"), customerController.deleteCustomer);

// Customer Account / Ledger. Reading serves two audiences — Sells reps sharing a customer's
// statement (via /sells) and Account/Admin browsing the full ledger from Account → Debited (via
// /account/debited) — so these two GET routes accept either permission. Actually managing the
// ledger — recording a payment, editing, or deleting a transaction — is Account-module-only and
// hard role-checked in the controller (Admin/Account to write, Admin-only to delete) regardless
// of the permission table.
router.get("/:id/ledger", authenticate, authorizeAny(["/sells", "/account/debited"]), customerLedgerController.getLedger);
router.get("/:id/ledger/statement.pdf", authenticate, authorizeAny(["/sells", "/account/debited"]), customerLedgerController.getStatementPdf);
router.post("/:id/ledger/payments", authenticate, authorize("/account/debited", "create"), customerLedgerController.recordPayment);
router.post("/:id/ledger/manual-debits", authenticate, authorize("/account/debited", "create"), customerLedgerController.recordManualDebit);
router.put("/:id/ledger/entries/:entryId", authenticate, authorize("/account/debited", "update"), customerLedgerController.updateEntry);
router.delete("/:id/ledger/entries/:entryId", authenticate, authorize("/account/debited", "delete"), customerLedgerController.deleteEntry);

module.exports = router;
