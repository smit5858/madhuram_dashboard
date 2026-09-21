const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Multiple notes per task, one row each — adding a note never touches earlier ones. An edit
// updates content in place (updatedAt then differs from createdAt), but the previous text is
// preserved in the activity log's NOTE_UPDATED entry (see task.controller.js#updateTaskNote), so
// nothing is ever lost.
const TaskNote = sequelize.define(
  "TaskNote",
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
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
    tableName: "task_notes",
    timestamps: true,
  }
);

module.exports = TaskNote;
