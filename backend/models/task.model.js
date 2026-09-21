const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Task = sequelize.define(
  "Task",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Distinguishes the three workflows: Admin assigns to employees, an employee assigns to
    // another employee, or the task belongs to a Project (see projectId below). Kept on one
    // table rather than three so assignees/work sessions/comments/attachments/activity logs
    // aren't duplicated per flow.
    taskType: {
      type: DataTypes.ENUM("ADMIN_TO_EMPLOYEE", "EMPLOYEE_TO_EMPLOYEE", "PROJECT_TASK"),
      allowNull: false,
    },
    // Required iff taskType === PROJECT_TASK (enforced in the controller, not here — a plain
    // nullable FK, same convention as Courier.saleId).
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "projects",
        key: "id",
      },
    },
    priority: {
      type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "URGENT"),
      allowNull: false,
      defaultValue: "MEDIUM",
    },
    // Lifecycle: Pending -> In Progress -> In Review -> Completed, with On Hold/Cancelled as side
    // exits and Completed -> (anything else) as an explicit "reopen" — see
    // task.controller.js#updateTaskStatus for the reopen bookkeeping (completedBy/completedAt
    // cleared, a TASK_REOPENED activity logged). These are also the Kanban board's columns.
    status: {
      type: DataTypes.ENUM("PENDING", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "COMPLETED", "CANCELLED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dueAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    // Set/cleared alongside status transitions into/out of COMPLETED — never set directly.
    completedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "tasks",
    timestamps: true,
  }
);

module.exports = Task;
