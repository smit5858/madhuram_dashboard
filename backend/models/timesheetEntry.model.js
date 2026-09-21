const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per work-log line ("On <workDate> I worked on <task> from <startTime> to <endTime>").
// An employee can log many rows per day. userId is always the logged-in user (set server-side,
// never taken from the request); only an Admin may edit/delete a row afterwards — see
// timesheet.controller.js.
//
// Times are stored as plain "HH:mm" wall-clock values with the day they started on (workDate);
// endsNextDay marks an entry that runs past midnight. durationMinutes is derived on save
// (end - start, +24h when endsNextDay) and persisted so totals can be summed in SQL.
//
// taskId/projectId are nullable FKs: a row must reference a task and/or a project (enforced in
// the controller). When a task is chosen, projectId is copied from the task so per-project totals
// work without a join. If the task/project is later deleted the row is kept (logged hours are
// never destroyed) and detached instead — deletedTaskTitle/deletedProjectName remember what it
// was linked to, see services/taskDeletion.service.js.
const TimesheetEntry = sequelize.define(
  "TimesheetEntry",
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
    taskId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "tasks",
        key: "id",
      },
    },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "projects",
        key: "id",
      },
    },
    workDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // MySQL TIME comes back as "HH:mm:ss" — the getters trim it to the "HH:mm" the API speaks.
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      get() {
        const value = this.getDataValue("startTime");
        return value ? String(value).slice(0, 5) : value;
      },
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
      get() {
        const value = this.getDataValue("endTime");
        return value ? String(value).slice(0, 5) : value;
      },
    },
    endsNextDay: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    durationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Who last changed the entry (an Admin correcting it) — null while it is still exactly as
    // the employee logged it.
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    deletedTaskTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    deletedProjectName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "timesheet_entries",
    timestamps: true,
    indexes: [{ fields: ["userId", "workDate"] }, { fields: ["taskId"] }, { fields: ["projectId"] }],
  }
);

module.exports = TimesheetEntry;
