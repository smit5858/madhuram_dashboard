const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Lead source (IndiaMART, WhatsApp, Facebook, ...) — Admin-managed via Settings → Platform
// Management (platform.controller.js). The Lead form only offers isActive:true rows, so a
// platform can be retired without breaking historical leads that still reference it.
const Platform = sequelize.define(
  "Platform",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: "platforms",
    timestamps: true,
    // Named (not inline column-level unique:true) so sync({alter:true}) recognizes this index
    // as already existing on every restart — see role.model.js for the same reasoning.
    indexes: [{ unique: true, fields: ["name"] }],
  }
);

module.exports = Platform;
