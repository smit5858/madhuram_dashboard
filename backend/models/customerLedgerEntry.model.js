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
    // SALE = debit (amount stored negative), PAYMENT = credit (positive), ADJUSTMENT = manual
    // correction (signed either way, created internally e.g. for a collected-amount correction —
    // see order.service.js#recordPayment). MANUAL_DEBIT = a debit added by hand from Account →
    // Debited's Add form (always negative) — kept distinct from ADJUSTMENT so the Debited main
    // table can unambiguously find "the" manually-added record for a customer to edit, without
    // ever picking up an unrelated system-generated correction entry.
    type: {
      type: DataTypes.ENUM("SALE", "PAYMENT", "ADJUSTMENT", "MANUAL_DEBIT"),
      allowNull: false,
    },
    // Signed. SALE rows are negative, PAYMENT rows are positive — balance is a plain SUM().
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    // Separate enum from Sale/Payment's paymentMethod — this one includes Cheque per the ledger
    // spec, deliberately kept apart so the existing Sale/Payment forms are untouched.
    paymentMethod: {
      type: DataTypes.ENUM("Cash", "UPI", "BankTransfer", "Cheque", "Card", "Other"),
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
    indexes: [{ fields: ["customerId"] }, { fields: ["saleId"] }],
  }
);

module.exports = CustomerLedgerEntry;
