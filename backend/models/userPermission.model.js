const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Per-user permission — the sole source of route-level access for non-Admin users. Absence
// of a row for a given (userId, routeId) means no access — see authorize.js and
// permission.controller.js.
const UserPermission = sequelize.define(
  "UserPermission",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
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
    // Per-user override of the role's viewAllRecords flag — see
    // backend/helper/permissionScope.js.
    viewAllRecords: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "user_permissions",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["userId", "routeId"],
      },
    ],
  }
);

module.exports = UserPermission;
