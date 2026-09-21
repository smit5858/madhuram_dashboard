const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Generic, append-only audit trail for Tasks, Projects and Timesheet entries — polymorphic (entityType/entityId)
// rather than one table per entity, same convention as StockMovement's referenceType/
// referenceId. Every mutating action in task.controller.js/project.controller.js writes one row
// here inside the same transaction as the underlying change (see services/activityLog.service.js)
// so this can never silently drift from reality. updatedAt is disabled — a log row is never
// edited after creation.
const ActivityLog = sequelize.define(
  "ActivityLog",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    entityType: {
      type: DataTypes.ENUM("TASK", "PROJECT", "TIMESHEET"),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.ENUM(
        "TASK_CREATED",
        "TASK_UPDATED",
        "PROJECT_CREATED",
        "PROJECT_UPDATED",
        "ASSIGNEE_ADDED",
        "ASSIGNEE_REMOVED",
        "MEMBER_ADDED",
        "MEMBER_REMOVED",
        "STATUS_CHANGED",
        "PRIORITY_CHANGED",
        "DESCRIPTION_CHANGED",
        "DUE_DATE_CHANGED",
        "ATTACHMENT_ADDED",
        "COMMENT_ADDED",
        "WORK_SESSION_STARTED",
        "WORK_SESSION_ENDED",
        "TASK_COMPLETED",
        "TASK_REOPENED",
        "TASK_REASSIGNED",
        "NOTE_ADDED",
        "NOTE_UPDATED",
        "TIMESHEET_ADDED",
        "TIMESHEET_UPDATED",
        "TIMESHEET_DELETED"
      ),
      allowNull: false,
    },
    actorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    // The user an entry is *about* when that differs from the actor — e.g. an Admin correcting an
    // employee's timesheet entry. Null for Task/Project rows.
    subjectUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    oldValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "activity_logs",
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = ActivityLog;
