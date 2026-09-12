const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// A customer ledger PAYMENT/ADJUSTMENT entry's amount can be split across multiple bank
// accounts — each row here is one (bank account, amount) allocation. Same pattern as
// saleBankAccount.model.js; the same bank account may appear in more than one row for the same
// entry (rows are never merged), so there is no unique constraint on ledgerEntryId+bankAccountId.
// See models/index.js for the CustomerLedgerEntry/BankAccount associations and
// customerLedger.service.js#normalizeBankPayments for validation + persistence.
const LedgerEntryBankAccount = sequelize.define(
  "LedgerEntryBankAccount",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ledgerEntryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "customer_ledger_entries",
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
    tableName: "ledger_entry_bank_accounts",
    timestamps: true,
  }
);

module.exports = LedgerEntryBankAccount;
