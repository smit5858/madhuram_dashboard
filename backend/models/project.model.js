const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Project = sequelize.define(
  "Project",
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "COMPLETED", "ARCHIVED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    // Who may create tasks under this project — ADMIN_ONLY (default) or ADMIN_AND_MEMBERS,
    // set by the Admin at project creation and editable afterwards. Enforced in
    // task.controller.js#createTask; a project member with no other role never bypasses this.
    taskCreationPermission: {
      type: DataTypes.ENUM("ADMIN_ONLY", "ADMIN_AND_MEMBERS"),
      allowNull: false,
      defaultValue: "ADMIN_ONLY",
    },
    // Projects can only be created by Admin (enforced in the controller, not here).
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    tableName: "projects",
    timestamps: true,
  }
);

module.exports = Project;
