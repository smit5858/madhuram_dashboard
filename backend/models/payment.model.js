const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per payment/deposit received against a Sale — the itemized history that
// Sale.collectedAmount is the running total of. Created by orderService.createOrder
// (initial payment, if any) and orderService.recordPayment (every subsequent payment).
const Payment = sequelize.define(
  "Payment",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "sells",
        key: "id",
      },
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    method: {
      type: DataTypes.ENUM("Cash", "UPI", "Card", "COD", "BankTransfer", "Other"),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    tableName: "sale_payments",
    timestamps: true,
  }
);

module.exports = Payment;
