const sequelize = require("../config/db");
const customerLedgerService = require("../services/customerLedger.service");
const { generateCustomerStatementPdf } = require("../services/customerStatement.service");
const { createIncomeForLedgerPayment, syncIncomeForLedgerEntryUpdate, removeIncomeForLedgerEntry } = require("../services/incomeSync.service");
const { recalculateDay } = require("../services/dailyBalance.service");
const { Customer } = require("../models");

const errorResponse = (res, err) => {
  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message });
};

// Only Admin/Account may create or edit customer ledger transactions — enforced here (not just
// via the generic canCreate/canUpdate permission) so a custom role can never be granted this,
// same pattern as expense.controller.js's hard Admin locks.
const isLedgerManager = (roleName) => roleName === "Admin" || roleName === "Account";

// GET /customers/debtors — Account → Debited list (pending-only customers, highest first)
exports.getDebtors = async (req, res) => {
  try {
    const { search, startDate, endDate, page, limit, status } = req.query;
    const result = await customerLedgerService.getDebtors({ search, startDate, endDate, page, limit, status });
    return res.status(200).json({
      success: true,
      data: result.customers,
      meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /customers/debtors/totals — Accounts dashboard "Receivable" KPI
exports.getReceivableTotals = async (req, res) => {
  try {
    const result = await customerLedgerService.getReceivableTotal();
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /customers/:id/ledger
exports.getLedger = async (req, res) => {
  try {
    const { customer, balance, entries } = await customerLedgerService.getCustomerLedger(req.params.id);
    return res.status(200).json({ success: true, data: { customer, balance, entries } });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /customers/:id/ledger/payments — Collect Amount, Admin/Account only. Also creates a
// linked Income entry (PENDING, same Admin-approval workflow as a Sale's own Income row) so
// every customer payment an Accountant records is auditable and only counts toward the
// company's Total Income once an Admin approves it — see incomeSync.service.js#createIncomeForLedgerPayment.
exports.recordPayment = async (req, res) => {
  try {
    if (!isLedgerManager(req.user.roleName)) {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin or Account can record a customer payment" });
    }

    const customer = await Customer.findByPk(req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    const { amount, paymentMethod, bankAccountId, transactionDate, reference, note, saleId } = req.body || {};

    const { entry, entryDate } = await sequelize.transaction(async (transaction) => {
      const entry = await customerLedgerService.recordPayment(
        { customerId: customer.id, saleId: saleId || null, amount, paymentMethod, bankAccountId, reference, note, transactionDate, userId: req.user.id },
        { transaction }
      );
      const entryDate = await createIncomeForLedgerPayment(
        {
          ledgerEntryId: entry.id,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          amount: entry.amount,
          paymentMethod: entry.paymentMethod,
          entryDate: entry.transactionDate,
          userId: req.user.id,
        },
        { transaction }
      );
      return { entry, entryDate };
    });

    await recalculateDay(entryDate);

    const balance = await customerLedgerService.getCustomerBalance(customer.id);
    return res.status(201).json({ success: true, message: "Payment recorded successfully", data: { entry, balance } });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /customers/:id/ledger/entries/:entryId — edit an entry (spec §20), Admin/Account only.
exports.updateEntry = async (req, res) => {
  try {
    if (!isLedgerManager(req.user.roleName)) {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin or Account can edit a ledger transaction" });
    }

    const { amount, paymentMethod, bankAccountId, transactionDate, reference, note } = req.body || {};

    const { entry, entryDate } = await sequelize.transaction(async (transaction) => {
      const entry = await customerLedgerService.updateEntry(
        { entryId: req.params.entryId, amount, paymentMethod, bankAccountId, transactionDate, reference, note },
        { transaction }
      );
      const entryDate = await syncIncomeForLedgerEntryUpdate(entry, { transaction });
      return { entry, entryDate };
    });

    if (entryDate) await recalculateDay(entryDate);

    const balance = await customerLedgerService.getCustomerBalance(req.params.id);
    return res.status(200).json({ success: true, message: "Transaction updated successfully", data: { entry, balance } });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /customers/:id/ledger/entries/:entryId — Admin-only hard delete (spec change: no more
// void/soft-delete). Also removes the linked Income entry, if any, so a deleted payment can't
// keep sitting in the Income list or (if it had already been approved) keep counting toward the
// daily balance.
exports.deleteEntry = async (req, res) => {
  try {
    if (req.user.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: only Admin can delete a ledger transaction" });
    }

    const { entryDate } = await sequelize.transaction(async (transaction) => {
      await customerLedgerService.deleteEntry({ entryId: req.params.entryId }, { transaction });
      const entryDate = await removeIncomeForLedgerEntry(req.params.entryId, { transaction });
      return { entryDate };
    });

    if (entryDate) await recalculateDay(entryDate);

    const balance = await customerLedgerService.getCustomerBalance(req.params.id);
    return res.status(200).json({ success: true, message: "Transaction deleted successfully", data: { balance } });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /customers/:id/ledger/statement.pdf
exports.getStatementPdf = async (req, res) => {
  try {
    const { customer, balance, entries } = await customerLedgerService.getCustomerLedger(req.params.id);
    return generateCustomerStatementPdf(customer, balance, entries, res);
  } catch (err) {
    return errorResponse(res, err);
  }
};
