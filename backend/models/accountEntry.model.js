const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per accounting transaction. EXPENSE rows are generated automatically from other
// modules (e.g. an Incoming Courier marked Done) and are never edited directly. INCOME rows
// back the Account / Income ledger — most are manually authored (create/edit/delete) via
// income.controller.js, but a Sale also auto-creates/syncs/removes its own INCOME row (see
// services/incomeSync.service.js) via the referenceType/referenceId link below. Both types
// feed the daily balance rollup — see services/dailyBalance.service.js.
const AccountEntry = sequelize.define(
  "AccountEntry",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entryType: {
      type: DataTypes.ENUM("EXPENSE", "INCOME"),
      allowNull: false,
      defaultValue: "EXPENSE",
    },
    category: { type: DataTypes.STRING, allowNull: false, defaultValue: "Courier" },
    description: { type: DataTypes.TEXT, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    // e.g. referenceType: "courier", referenceId: courier.id
    referenceType: { type: DataTypes.STRING, allowNull: true },
    referenceId: { type: DataTypes.INTEGER, allowNull: true },
    courierId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "couriers", key: "id" },
    },
    // Income-specific transaction details (null/unused for EXPENSE rows).
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "customers", key: "id" },
    },
    customerName: { type: DataTypes.STRING, allowNull: true },
    customerPhone: { type: DataTypes.STRING, allowNull: true },
    productName: { type: DataTypes.STRING, allowNull: true },
    serialNumber: { type: DataTypes.STRING, allowNull: true },
    paymentMethod: {
      type: DataTypes.ENUM("Cash", "UPI", "Card", "COD", "BankTransfer", "Other"),
      allowNull: true,
    },
    bankName: { type: DataTypes.STRING, allowNull: true },
    // Approval workflow (Expense only). INCOME rows and other entry types are created already
    // APPROVED (they have no approval step) — only expense.controller.js#createExpense and the
    // auto-created courier-charge entry (courier.controller.js#completeIncomingCourier) ever
    // start a row as PENDING. dailyBalance.service.js only sums APPROVED rows into the daily
    // Total In/Out, so a PENDING (or REJECTED) expense has zero effect on the balance.
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
      allowNull: false,
      defaultValue: "APPROVED",
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
  },
  {
    tableName: "account_entries",
    timestamps: true,
    // Defense-in-depth against duplicate auto-created entries (e.g. a Sale created twice,
    // a retried request) — at most one AccountEntry per (referenceType, referenceId) pair.
    // Rows with no reference (manual Income entries, balance adjustments) have NULL/NULL,
    // which MySQL's unique index treats as always-distinct, so they're unaffected.
    indexes: [{ unique: true, fields: ["referenceType", "referenceId"] }],
  }
);

module.exports = AccountEntry;
