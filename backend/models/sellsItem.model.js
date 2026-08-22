const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SaleItem = sequelize.define(
  "SaleItem",
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
      validate: {
        min: 1,
      },
    },
    sellingPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    },
    // FULFILLED = all stock available
    // PARTIAL   = some stock available, shortage recorded
    // OUT_OF_STOCK = no stock available at all
    fulfillmentStatus: {
      type: DataTypes.ENUM("FULFILLED", "PARTIAL", "OUT_OF_STOCK"),
      defaultValue: "FULFILLED",
    },
    // How many units could NOT be fulfilled from available stock
    shortageQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: "sells_items",
    timestamps: true,
  }
);

module.exports = SaleItem;
