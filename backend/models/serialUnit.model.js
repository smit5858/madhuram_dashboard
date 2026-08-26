const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per physical unit of a SERIALIZED product. Stock.quantity/reserved
// for a SERIALIZED product are denormalized counters over these rows' status —
// this table is the source of truth for identity, Stock is a fast-read mirror.
const SerialUnit = sequelize.define(
  "SerialUnit",
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
    serialNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("AVAILABLE", "RESERVED", "SOLD", "RETURNED", "DAMAGED", "LOST"),
      allowNull: false,
      defaultValue: "AVAILABLE",
    },
    // Set on RESERVED/SOLD. Not cleared on RETURNED — keeps audit lineage of the most recent sale.
    saleItemId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "sells_items",
        key: "id",
      },
    },
    // Purchase provenance for this specific physical unit — differs unit to unit even
    // within the same product. Sale-side date/customer info is never duplicated here;
    // it's read via saleItemId -> SaleItem.createdAt -> Sale.customer.
    purchasePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    // Asking price for this specific unit — set at receiving time, editable per unit even
    // within the same product. Distinct from SaleItem.sellingPrice, which is the price it
    // actually sold for (read via saleItemId) and can differ from this listed price.
    sellingPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    purchaseDate: {
      type: DataTypes.DATEONLY,
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
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    soldAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    returnedAt: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: "serial_units",
    timestamps: true,
    indexes: [
      // Unique per-product, not globally — vendor serial formats can collide across unrelated products
      { unique: true, fields: ["productId", "serialNumber"] },
      { fields: ["status"] },
      { fields: ["saleItemId"] },
    ],
  }
);

module.exports = SerialUnit;
