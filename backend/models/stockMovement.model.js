const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const StockMovement = sequelize.define(
  "StockMovement",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "products",
        key: "id",
      },
    },
    type: {
      type: DataTypes.ENUM("PURCHASE", "SALE", "RETURN", "ADJUSTMENT"),
      allowNull: false,
    },
    // Positive = stock added, Negative = stock deducted
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    referenceType: {
      type: DataTypes.STRING,
      allowNull: true, // e.g. "sale", "purchase", "manual"
    },
    referenceId: {
      type: DataTypes.INTEGER,
      allowNull: true, // sale.id or null for manual adjustments
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "stock_movements",
    timestamps: true,
  }
);

module.exports = StockMovement;
