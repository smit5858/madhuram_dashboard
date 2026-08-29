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
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    trackingLinkTemplate: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "courier_companies", timestamps: true }
);

module.exports = CourierCompany;
