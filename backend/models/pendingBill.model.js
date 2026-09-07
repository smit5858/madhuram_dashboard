const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// A separate ledger from Expense (AccountEntry) — bills/expenses like office rent, product
// purchases, or vendor/dealer bills recorded by the team and paid off by one or more Admin-
// verified payments (see pendingBillPayment.model.js). Only once a bill is fully paid
// (remainingAmount reaches 0, status becomes APPROVED) does it get mirrored into an AccountEntry
// (see pendingBill.controller.js), which is the only thing dailyBalance.service.js sums into
// Total Out — same rule as before, just triggered by the last verified payment instead of a
// single manual "Approve" click.
//
// billType distinguishes a manually-entered general bill (office rent, etc.) from one
// auto-created when a new product is added or an existing product is restocked (see
// pendingBillService.js#createBillForPurchase, hooked into product.controller.js#createProduct
// and inventory.service.js#receiveStock) — both live in this same table/list/flow, the restock
// ones simply carry the extra product/dealer/quantity detail below.
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
    // Optional — bills like office rent or other business bills have no dealer/vendor.
    dealerName: { type: DataTypes.STRING, allowNull: true },
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
    indexes: [{ fields: ["status"] }, { fields: ["billDate"] }, { fields: ["billType"] }, { fields: ["productId"] }],
  }
);

module.exports = PendingBill;
