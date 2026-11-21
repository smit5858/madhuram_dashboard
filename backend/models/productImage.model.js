const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Product photos stored in the database (up to MAX_IMAGES_PER_PRODUCT per product — see
// services/productImage.service.js). The binary `data` column must never be loaded by list/detail
// queries — always pass explicit `attributes` without it; only GET /products/:id/images/:imageId
// reads it. The lowest sortOrder is the product's cover photo (used for the share card/PDF).
const ProductImage = sequelize.define(
  "ProductImage",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    data: {
      // MEDIUMBLOB (16 MB) — uploads are capped at 5 MB and usually ~200-400 KB after the
      // frontend's resize, so a plain BLOB (64 KB) would be too small.
      type: DataTypes.BLOB("medium"),
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "product_images",
    timestamps: true,
    indexes: [{ fields: ["productId", "sortOrder"] }],
  }
);

module.exports = ProductImage;
