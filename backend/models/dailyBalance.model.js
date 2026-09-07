const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per calendar date that has ever had Income/Expense activity. Rows are created/kept
// in sync exclusively by services/dailyBalance.service.js#recalculateDay — never written to
// directly from a controller. closingBalance always equals openingBalance + totalIn - totalOut;
// openingBalance always equals the previous existing row's closingBalance (or 0 if this is the
// first-ever row).
const DailyAccountBalance = sequelize.define(
  "DailyAccountBalance",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    openingBalance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    totalIn: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    totalOut: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    closingBalance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "daily_account_balances",
    timestamps: true,
    indexes: [{ unique: true, fields: ["date"] }],
  }
);

module.exports = DailyAccountBalance;
