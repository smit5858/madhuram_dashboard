const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per calendar month — backs the "Courier Charge" figure shown/edited at the top of
// the Couriers page. Each month starts fresh (no row until someone sets it); previous months'
// amounts are never touched once that month has passed.
const CourierCharge = sequelize.define(
  "CourierCharge",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    month: { type: DataTypes.INTEGER, allowNull: false }, // 1-12
    year: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "courier_charges",
    timestamps: true,
    indexes: [{ unique: true, fields: ["month", "year"] }],
  }
);

module.exports = CourierCharge;
