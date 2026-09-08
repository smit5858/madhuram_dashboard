const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// A sale's paid amount can be split across multiple bank accounts — each row here is one
// (bank account, amount) allocation. The same bank account may appear in more than one row for
// the same sale (rows are never merged), so there is no unique constraint on saleId+bankAccountId.
// See models/index.js for the Sale/BankAccount associations and sells.controller.js/
// order.service.js#normalizeBankPayments for validation + persistence.
const SaleBankAccount = sequelize.define(
  "SaleBankAccount",
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
    bankAccountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "bank_accounts",
        key: "id",
      },
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
  },
  {
    tableName: "sale_bank_accounts",
    timestamps: true,
  }
);

module.exports = SaleBankAccount;
