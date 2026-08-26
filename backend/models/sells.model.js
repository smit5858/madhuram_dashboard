const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Sale = sequelize.define(
  "Sale",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "customers",
        key: "id",
      },
    },
    customerName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    customerNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paymentMethod: {
      type: DataTypes.ENUM("Cash", "UPI", "Card", "COD", "BankTransfer", "Other"),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fromAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sellingAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    collectedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // Backend-computed: sellingAmount - collectedAmount
    pendingAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // Backend-computed, refunded portion of collectedAmount
    refundedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // Backend-derived from sellingAmount/collectedAmount/refundedAmount — never set directly
    paymentStatus: {
      type: DataTypes.ENUM("UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "PARTIALLY_REFUNDED"),
      allowNull: false,
      defaultValue: "UNPAID",
    },
    // Backend-derived aggregate of item.fulfillmentStatus — independent of paymentStatus
    fulfillmentStatus: {
      type: DataTypes.ENUM("PENDING", "PARTIALLY_FULFILLED", "FULFILLED", "BACKORDERED", "CANCELLED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    status: {
      type: DataTypes.ENUM("PENDING", "CONFIRMED", "FULFILLED", "CANCELLED"),
      defaultValue: "PENDING",
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
    tableName: "sells",
    timestamps: true,
    // Named index, not inline unique:true — see role.model.js for why.
    indexes: [{ unique: true, fields: ["invoiceNumber"] }],
  }
);

module.exports = Sale;
