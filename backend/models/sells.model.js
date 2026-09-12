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
      type: DataTypes.ENUM("Cash", "UPI", "Card", "BankTransfer", "Other"),
      allowNull: true,
    },
    // Legacy single-account column, superseded by the sale_bank_accounts join table (see
    // models/index.js) which allows selecting multiple accounts. Kept in sync as the first
    // selected account for any code that still reads it directly.
    bankAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "bank_accounts",
        key: "id",
      },
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
    // Set once, at creation, for a Sale auto-created from a Lead marked Complete (see
    // lead.controller.js#ensureSaleForLead). Null for every ordinary manually-created sale.
    // The unique index is the authoritative guard against creating a second Sale for the same
    // Lead (multiple NULLs are treated as distinct by MySQL, so it never affects other sales).
    leadId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "leads",
        key: "id",
      },
    },
    // Who this order is being sent to/handled by. Defaults to "Madhuram Motor" for the
    // common case; editable when an order is sent by/to another party.
    to: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "Madhuram Motor",
    },
    // Optional courier company chosen at sale-entry time — seeds Courier.courierName on the
    // record(s) auto-created for this sale (see orderService.createOrder); still freely
    // editable per-record afterward from the Courier module.
    courierName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "sells",
    timestamps: true,
    // Named index, not inline unique:true — see role.model.js for why.
    indexes: [{ unique: true, fields: ["invoiceNumber"] }, { unique: true, fields: ["leadId"] }],
  }
);

module.exports = Sale;
