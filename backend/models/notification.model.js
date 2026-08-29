const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Which module should receive this notification
    recipientModule: {
      type: DataTypes.ENUM("couriers", "account", "admin", "all"),
      allowNull: false,
    },
    // Set for a personal notification targeted at one specific user (e.g. the
    // salesperson whose sale was just delivered); null = module-wide broadcast.
    recipientUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    type: {
      type: DataTypes.ENUM("NEW_SALE", "NEW_CUSTOMER", "STOCK_LOW", "PAYMENT_RECEIVED", "ORDER_FULFILLED", "BACKORDER_ALLOCATED"),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    referenceType: {
      type: DataTypes.STRING,
      allowNull: true, // e.g. "sale"
    },
    referenceId: {
      type: DataTypes.INTEGER,
      allowNull: true, // e.g. sale.id
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "notifications",
    timestamps: true,
  }
);

module.exports = Notification;
