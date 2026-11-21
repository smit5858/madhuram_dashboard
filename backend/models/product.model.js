const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    productType: {
      type: DataTypes.ENUM("NON_SERIAL", "SERIALIZED", "SOFTWARE", "HARDWARE_ORDER_BASED"),
      allowNull: false,
      defaultValue: "NON_SERIAL",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // false for products quick-added from the Sells form without "Save as New Product" — the
    // row still exists (a SaleItem needs a real productId to track stock/fulfillment) but it's
    // scoped to that one transaction and left out of the master product catalog and its filters.
    isMasterProduct: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // LEGACY — photos now live in the product_images table (models/productImage.model.js). This
    // column only holds a file name under backend/uploads/products that hasn't been moved into the
    // DB yet; migrateLegacyProductImageFiles (services/productImage.service.js) moves it on server
    // start and nulls it. Kept in the model so sync({alter:true}) doesn't drop it before that runs.
    imageFile: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "products",
    timestamps: true,
  }
);

module.exports = Product;
