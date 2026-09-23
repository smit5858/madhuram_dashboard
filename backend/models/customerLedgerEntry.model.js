const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per customer-account financial event. The customer's running balance is always
// SUM(amount) over every remaining row for that customer — see customerLedger.service.js, the
// single place that computation happens. Admin delete is a hard delete (destroy), not a
// soft-void — see customerLedger.service.js#deleteEntry.
const CustomerLedgerEntry = sequelize.define(
  "CustomerLedgerEntry",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "customers", key: "id" },
    },
    // Traceability only — which sale this entry originated from/relates to. Nullable: a
    // customer-level payment collected from the Ledger page (not a specific sale row) has none.
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "sells", key: "id" },
    },
    // Traceability only — which specific Payment row (sale_payments) this entry mirrors, when it
    // was created alongside one (see order.service.js#applyPaymentsToSale/createOrder). Nullable:
    // a MANUAL_DEBIT, a customer-level payment collected from the Ledger page, or any entry
    // predating this column has none. Lets editing/deleting a Payment row keep its mirrored
    // ledger entry in sync instead of leaving it stale — see
    // sells.controller.js#updatePayment/deletePayment.
    paymentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "sale_payments", key: "id" },
    },
    // SALE = debit (amount stored negative), PAYMENT = credit (positive), ADJUSTMENT = manual
    // correction (signed either way, created internally e.g. for a collected-amount correction —
    // see order.service.js#recordPayment). MANUAL_DEBIT = a debit added by hand from Account →
    // Debited's Add form (always negative) — kept distinct from ADJUSTMENT so the Debited main
    // table can unambiguously find "the" manually-added record for a customer to edit, without
    // ever picking up an unrelated system-generated correction entry. DISCOUNT = a discount given
    // to the customer from the Ledger page (stored positive, so it reduces pending like a credit)
    // — deliberately NOT money received, so it never creates an Income/Expense entry.
    type: {
      type: DataTypes.ENUM("SALE", "PAYMENT", "ADJUSTMENT", "MANUAL_DEBIT", "DISCOUNT"),
      allowNull: false,
    },
    // Signed. SALE rows are negative, PAYMENT rows are positive — balance is a plain SUM().
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    // Separate enum from Sale/Payment's paymentMethod, deliberately kept apart so the existing
    // Sale/Payment forms are untouched. "Cheque" was retired — see
    // server.js#ensureChequePaymentMethodBackfilled for the one-time data migration.
    paymentMethod: {
      type: DataTypes.ENUM("Cash", "UPI", "BankTransfer", "Card", "Other"),
      allowNull: true,
    },
    bankAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "bank_accounts", key: "id" },
    },
    transactionDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
  },
  {
    tableName: "customer_ledger_entries",
    timestamps: true,
    indexes: [{ fields: ["customerId"] }, { fields: ["saleId"] }, { fields: ["paymentId"] }],
  }
);

module.exports = CustomerLedgerEntry;
