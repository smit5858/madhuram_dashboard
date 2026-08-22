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
      unique: true,
    },
  },
  {
    tableName: "routes",
    timestamps: true,
  }
);

module.exports = Route;
