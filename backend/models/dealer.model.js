const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Supplier we buy inventory from — attached to Stock (NON_SERIAL, current supplier),
// StockMovement (NON_SERIAL, per-purchase supplier) and SerialUnit (SERIALIZED, per-unit supplier).
const Dealer = sequelize.define(
  "Dealer",
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
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
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
    tableName: "dealers",
    timestamps: true,
    indexes: [{ fields: ["name"] }],
  }
);

module.exports = Dealer;
