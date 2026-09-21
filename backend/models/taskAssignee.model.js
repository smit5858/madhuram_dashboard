const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// No unique index on (taskId, userId) — an assignee can be removed and re-added, and every
// past assignment row must stay visible in the task's audit history (see removedAt/removedBy
// below). An "active" assignment is one where removedAt is null.
const TaskAssignee = sequelize.define(
  "TaskAssignee",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    taskId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "tasks",
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
    assignedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
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
    tableName: "task_assignees",
    timestamps: true,
  }
);

module.exports = TaskAssignee;
