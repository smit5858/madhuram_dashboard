const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Purpose-built, narrower sibling of activity_logs (see activityLog.model.js) — just status
// transitions, so "time spent in each status" style reporting can query this table alone
// without filtering a general activity feed. Plain STRING (not ENUM) for old/new status so this
// table never needs a schema change when Task.status's enum values evolve; oldStatus is null
// only for the seed row written at task creation (see task.controller.js#createTask).
const TaskStatusHistory = sequelize.define(
  "TaskStatusHistory",
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
    oldStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    newStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    changedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "task_status_history",
    timestamps: true,
  }
);

module.exports = TaskStatusHistory;
