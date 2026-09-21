const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// No unique index on (projectId, userId): a user can be removed and re-added to the same
// project, and every past membership row must stay visible in the audit history (see
// removedAt/removedBy below) — see task_assignees for the identical pattern.
const ProjectMember = sequelize.define(
  "ProjectMember",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "projects",
        key: "id",
      },
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    addedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    addedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    // Soft-remove only — a removed membership row is kept (not deleted) so it still shows in
    // the project's audit history. An "active" membership is one where removedAt is null.
    removedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    removedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "project_members",
    timestamps: true,
  }
);

module.exports = ProjectMember;
