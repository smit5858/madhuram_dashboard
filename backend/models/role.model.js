const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Role = sequelize.define(
  "Role",
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
  },
  {
    tableName: "roles",
    timestamps: true,
    // Named (not inline column-level unique:true) so sync({alter:true}) recognizes this
    // index as already existing on every restart, instead of adding a new duplicate each
    // time — inline unique:true does not survive alter-sync comparisons reliably in MySQL.
    indexes: [{ unique: true, fields: ["name"] }],
  }
);

module.exports = Role;
