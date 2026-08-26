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
      type: DataTypes.ENUM(
        "PURCHASE",
        "SALE",
        "RESERVATION",
        "RELEASE",
        "RETURN",
        "ADJUSTMENT",
        "DAMAGE",
        "TRANSFER"
      ),
      allowNull: false,
    },
    // On-hand quantity delta. Positive = stock added, Negative = stock deducted.
    // Always 0 for RESERVATION/RELEASE, which only move the `reserved` sub-counter.
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Reserved-counter delta. Always 0 except for RESERVATION (positive) and RELEASE (negative).
    reservedDelta: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // PURCHASE rows only — cost/dealer/date for this specific batch. Null on every other type.
    purchasePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    dealerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "dealers",
        key: "id",
      },
    },
    purchaseDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
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
