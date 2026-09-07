const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Admin-managed lookup table for courier companies — replaces the old hardcoded frontend list.
// trackingLinkTemplate holds a URL containing a "{trackId}" placeholder (e.g.
// "https://www.delhivery.com/track/package/{trackId}"), substituted client-side to build a
// clickable tracking link once a courier record has a Track ID.
const CourierCompany = sequelize.define(
  "CourierCompany",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    trackingLinkTemplate: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "courier_companies",
    timestamps: true,
    // Named (not inline column-level unique:true) so sync({alter:true}) recognizes this
    // index as already existing on every restart, instead of adding a new duplicate each
    // time — inline unique:true does not survive alter-sync comparisons reliably in MySQL.
    indexes: [{ unique: true, fields: ["name"] }],
  }
);

module.exports = CourierCompany;
