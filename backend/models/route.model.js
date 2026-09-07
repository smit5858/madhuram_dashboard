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
    // Parent grouping label for the Route Setting permission matrix (e.g. "Courier", "Account",
    // "Setting"). Purely presentational — there is no parent-level Route/permission row; routes
    // with no module render as flat top-level rows, same as before this column existed.
    module: {
      type: DataTypes.STRING,
      allowNull: true,
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
