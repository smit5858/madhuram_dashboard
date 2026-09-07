const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Admin-managed lookup table for the business's bank accounts — consumed as a dropdown from
// the Sells module when Payment Method = BankTransfer (see order.service.js).
const BankAccount = sequelize.define(
  "BankAccount",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    bankName: { type: DataTypes.STRING, allowNull: false },
    accountHolderName: { type: DataTypes.STRING, allowNull: true },
    accountNumber: { type: DataTypes.STRING, allowNull: true },
    ifscCode: { type: DataTypes.STRING, allowNull: true },
    branchName: { type: DataTypes.STRING, allowNull: true },
    upiId: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "bank_accounts",
    timestamps: true,
    // Named (not inline column-level unique:true) so sync({alter:true}) recognizes this
    // index as already existing on every restart — see courierCompany.model.js for why.
    indexes: [{ unique: true, fields: ["accountNumber"] }],
  }
);

module.exports = BankAccount;
