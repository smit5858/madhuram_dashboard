const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Stock = sequelize.define(
  "Stock",
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
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    // Units already committed to an order but not yet shipped/fulfilled.
    // available = quantity - reserved (always computed, never stored).
    reserved: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    // Current/last cost per unit. Full purchase-batch history (price/dealer/date per
    // restock) lives on StockMovement — this is just the latest value for quick display.
    purchasePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    sellingPrice: {
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
  },
  {
    tableName: "stocks",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["productId"],
      },
    ],
  }
);

module.exports = Stock;
