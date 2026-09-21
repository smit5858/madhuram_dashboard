const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const { accountKeyFor } = require("../helper/pendingBillAccount");

// One bill owed to a Seller/Dealer/Company, recorded manually by the team. Bills for the same
// seller are grouped into one Pending Bill account (see accountKey below and
// helper/pendingBillAccount.js) — the main Pending Bill list shows accounts, not bills, and the
// account's page shows its bills, its payments and a running outstanding balance, like Debited's
// customer account.
//
// A bill is paid off by one or more payments (see pendingBillPayment.model.js) — made against the
// account (applied oldest-bill-first) or against this bill directly. Each payment creates its own
// linked Expense (AccountEntry, referenceType "pendingBillPayment") created by whoever made it —
// see pendingBill.service.js#createExpenseForPayment. Creating or editing a bill itself creates no
// Expense: dailyBalance.service.js only sums an Expense into Total Out once an Admin approves it.
//
// billType: manual bills are always "GENERAL". "RESTOCK" is legacy — bills used to be auto-created
// when a product was added/restocked; that no longer happens, but existing RESTOCK rows are kept
// (with the extra product/dealer/quantity detail below) and still display.
const PendingBill = sequelize.define(
  "PendingBill",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    billType: {
      type: DataTypes.ENUM("GENERAL", "RESTOCK"),
      allowNull: false,
      defaultValue: "GENERAL",
    },
    name: { type: DataTypes.STRING, allowNull: false },
    // The Seller/Dealer/Company this bill is owed to — required for new bills (see
    // pendingBill.controller.js), and what bills are grouped into an account by. Older bills may
    // have none, in which case they group by `name`.
    dealerName: { type: DataTypes.STRING, allowNull: true },
    // Derived from dealerName/name by the beforeSave hook below (see helper/pendingBillAccount.js)
    // — never set directly. Identifies which Pending Bill account this bill belongs to.
    accountKey: { type: DataTypes.STRING, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    billDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },

    // Restock-only detail — null for GENERAL bills.
    productId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "products", key: "id" },
    },
    productNameSnapshot: { type: DataTypes.STRING, allowNull: true },
    dealerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "dealers", key: "id" },
    },
    stockMovementId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "stock_movements", key: "id" },
    },
    quantity: { type: DataTypes.INTEGER, allowNull: true },
    purchasePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    billNumber: { type: DataTypes.STRING, allowNull: true },

    // Always recomputed from verified PendingBillPayment rows — never set directly from client
    // input. See pendingBillService.js#recalculateStatus.
    paidAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    remainingAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },

    status: {
      type: DataTypes.ENUM("PENDING", "PARTIALLY_PAID", "PENDING_VERIFICATION", "APPROVED", "REJECTED", "CANCELLED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
  },
  {
    tableName: "pending_bills",
    timestamps: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["billDate"] },
      { fields: ["billType"] },
      { fields: ["productId"] },
      { fields: ["accountKey"] },
    ],
    hooks: {
      beforeSave: (bill) => {
        bill.accountKey = accountKeyFor(bill);
      },
    },
  }
);

module.exports = PendingBill;
