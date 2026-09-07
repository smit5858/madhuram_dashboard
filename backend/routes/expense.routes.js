const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const expenseController = require("../controllers/expense.controller");

// Static sub-paths declared before /:id so they are never swallowed by the param route.
router.get("/totals", authenticate, authorize("/account/expense", "read"), expenseController.getExpenseTotals);

router.get("/", authenticate, authorize("/account/expense", "read"), expenseController.getExpenses);
router.post("/", authenticate, authorize("/account/expense", "create"), expenseController.createExpense);
router.get("/:id", authenticate, authorize("/account/expense", "read"), expenseController.getExpenseById);
// Edit/Delete/Approve are Admin-only — enforced inline in the controller, independent of the
// generic canUpdate/canDelete permission (see expense.controller.js).
router.put("/:id", authenticate, expenseController.updateExpense);
router.delete("/:id", authenticate, expenseController.deleteExpense);
router.put("/:id/approve", authenticate, expenseController.approveExpense);
router.put("/:id/reject", authenticate, expenseController.rejectExpense);

module.exports = router;
