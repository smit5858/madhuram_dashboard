const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// A separate ledger from Expense (AccountEntry) — bills/expenses like office rent, product
// purchases, or vendor/dealer bills recorded by the team and approved by an Admin. Only on
// approval does a bill get mirrored into an AccountEntry (see pendingBill.controller.js), which
// is the only thing dailyBalance.service.js sums into Total Out.
const PendingBill = sequelize.define(
  "PendingBill",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    // Optional — bills like office rent or other business bills have no dealer/vendor.
    dealerName: { type: DataTypes.STRING, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    billDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED"),
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
    indexes: [{ fields: ["status"] }, { fields: ["billDate"] }],
  }
);

module.exports = PendingBill;
