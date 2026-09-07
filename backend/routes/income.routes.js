const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const incomeController = require("../controllers/income.controller");

// Static sub-paths declared before /:id so they are never swallowed by the param route.
router.get("/totals", authenticate, authorize("/account/income", "read"), incomeController.getIncomeTotals);
router.get("/daily-balances", authenticate, authorize("/account/income", "read"), incomeController.getDailyBalances);
// Role-checked inline in the controller (Admin or Account) — independent of canUpdate, since
// Account can perform this balance correction even though it cannot edit Income records.
router.post("/update-balance", authenticate, incomeController.updateBalance);

router.get("/", authenticate, authorize("/account/income", "read"), incomeController.getIncomeEntries);
router.post("/", authenticate, authorize("/account/income", "create"), incomeController.createIncomeEntry);
router.get("/:id", authenticate, authorize("/account/income", "read"), incomeController.getIncomeById);
router.put("/:id", authenticate, authorize("/account/income", "update"), incomeController.updateIncomeEntry);
router.delete("/:id", authenticate, authorize("/account/income", "delete"), incomeController.deleteIncomeEntry);
// Admin-only — enforced inline in the controller, independent of the generic canUpdate
// permission (see income.controller.js#approveIncome).
router.put("/:id/approve", authenticate, incomeController.approveIncome);

module.exports = router;
