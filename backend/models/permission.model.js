const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Permission = sequelize.define(
  "Permission",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "roles",
        key: "id",
      },
    },
    routeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "routes",
        key: "id",
      },
    },
    canRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    canCreate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    canUpdate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    canDelete: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "permissions",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["roleId", "routeId"],
      },
    ],
  }
);

module.exports = Permission;
