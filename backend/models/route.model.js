const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Route = sequelize.define(
  "Route",
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
    path: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "routes",
    timestamps: true,
    // Named index, not inline unique:true — see role.model.js for why.
    indexes: [{ unique: true, fields: ["path"] }],
  }
);

module.exports = Route;
