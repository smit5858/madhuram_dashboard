const { Op, fn, col } = require("sequelize");
const sequelize = require("../config/db");
const { TimesheetEntry, Task, Project, User, ActivityLog } = require("../models");
const { canViewAllRecords } = require("../helper/permissionScope");
const { logActivity } = require("../services/activityLog.service");
const { canActOnTask, buildTaskScopeWhere } = require("./task.controller");
const { buildProjectScopeWhere, canAccessProject } = require("./project.controller");

const ROUTE_PATH = "/timesheets";
const MAX_TEXT_LENGTH = 2000;
const MAX_OPTION_ROWS = 500;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ENTRY_INCLUDE = [
  { model: User, as: "user", attributes: ["id", "name"] },
  { model: User, as: "editor", attributes: ["id", "name"] },
  { model: Task, as: "task", attributes: ["id", "title", "status", "projectId"] },
  { model: Project, as: "project", attributes: ["id", "name"] },
];

// ---------- date / time helpers ----------

const dayIndex = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const dateFromIndex = (index) => new Date(index * 86400000).toISOString().slice(0, 10);

const isRealDate = (value) => typeof value === "string" && DATE_RE.test(value) && dateFromIndex(dayIndex(value)) === value;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// "2h 30m" / "2h" / "45m" — matches the wording used in the history entries.
const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
};

const formatDisplayDate = (dateStr) => dateStr.split("-").reverse().join("-");

const formatClock = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const formatRange = ({ startTime, endTime, endsNextDay }) => `${formatClock(startTime)} – ${formatClock(endTime)}${endsNextDay ? " (+1 day)" : ""}`;

// Duration = End - Start. An entry that runs past midnight must be flagged with endsNextDay
// explicitly — otherwise an End earlier than (or equal to) Start is simply a mistake.
const computeDuration = ({ startTime, endTime, endsNextDay }) => {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (!endsNextDay) {
    if (end <= start) {
      return { error: "End time must be after start time (tick \"Ends next day\" if the work ran past midnight)" };
    }
    return { minutes: end - start };
  }
  const minutes = end + 1440 - start;
  if (minutes >= 1440) {
    return { error: "A single work log cannot be 24 hours or longer" };
  }
  return { minutes };
};

// Logs may be back-dated freely but not booked into the future. One day of slack absorbs the
// difference between the server's and the employee's timezone.
const isTooFarInFuture = (workDate) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dayIndex(workDate) > dayIndex(today) + 1;
};

// The server-local "YYYY-MM-DD" / "HH:mm" for a Date instant — what the Start/End Time buttons
// stamp onto workDate/startTime/endTime, matching the format every other part of this module uses.
const partsOf = (date) => ({
  workDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  clockTime: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
});

// ---------- request parsing ----------

// undefined = not supplied, null = explicitly cleared, NaN = malformed.
const toId = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : NaN;
};

const cleanText = (value) => (typeof value === "string" ? value.trim() : value);

const buildCandidate = (existing, body) => {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
  return {
    workDate: pick("workDate", existing?.workDate),
    description: cleanText(pick("description", existing?.description)),
    startTime: pick("startTime", existing?.startTime),
    endTime: pick("endTime", existing?.endTime),
    endsNextDay: pick("endsNextDay", existing?.endsNextDay ?? false),
    notes: cleanText(pick("notes", existing?.notes)) || null,
    taskId: toId(pick("taskId", existing?.taskId ?? null)),
    projectId: toId(pick("projectId", existing?.projectId ?? null)),
  };
};

const validateCandidate = (c) => {
  if (!isRealDate(c.workDate)) return "A valid work date (YYYY-MM-DD) is required";
  if (isTooFarInFuture(c.workDate)) return "Work cannot be logged for a future date";
  if (!c.description) return "Describe the work you did";
  if (typeof c.description !== "string" || c.description.length > MAX_TEXT_LENGTH) return `Work description must be under ${MAX_TEXT_LENGTH} characters`;
  if (c.notes && (typeof c.notes !== "string" || c.notes.length > MAX_TEXT_LENGTH)) return `Notes must be under ${MAX_TEXT_LENGTH} characters`;
  if (typeof c.startTime !== "string" || !TIME_RE.test(c.startTime)) return "A valid start time (HH:mm) is required";
  if (typeof c.endTime !== "string" || !TIME_RE.test(c.endTime)) return "A valid end time (HH:mm) is required";
  if (typeof c.endsNextDay !== "boolean") return "endsNextDay must be true or false";
  if (Number.isNaN(c.taskId) || Number.isNaN(c.projectId)) return "Invalid task or project";
  return null;
};

// Works out which task/project the entry is booked against. Picking a task pins the project to
// that task's project; a project-only entry is allowed for work that isn't tied to one task, and
// neither is required at all — "Other Work" that was never an assigned task can be logged with no
// link. Visibility is only re-checked when the link actually changes, so an employee can still fix
// a typo in an old entry after losing access to its task.
//
// The task check is canActOnTask (Admin / creator / active assignee), not the broader canViewTask
// — being able to merely see a task (e.g. as a fellow project member who isn't assigned to it)
// must not be enough to book time against it; only someone who can actually work the task may.
const resolveLinks = async (candidate, existing, user, transaction) => {
  const { taskId, projectId } = candidate;

  if (taskId) {
    const task = await Task.findByPk(taskId, { transaction });
    if (!task) return { status: 404, error: "Task not found" };
    if ((!existing || existing.taskId !== taskId) && !(await canActOnTask(task, user, transaction))) {
      return { status: 403, error: "Access denied: you are not assigned to this task" };
    }
    return { taskId: task.id, projectId: task.projectId };
  }

  if (projectId) {
    const project = await Project.findByPk(projectId, { transaction });
    if (!project) return { status: 404, error: "Project not found" };
    if ((!existing || existing.taskId || existing.projectId !== projectId) && !(await canAccessProject(project, user, transaction))) {
      return { status: 403, error: "Access denied: you are not a member of this project" };
    }
    return { taskId: null, projectId: project.id };
  }

  // No task/project selected — "Other Work": logged hours that were never an assigned task, or an
  // entry whose task/project was since deleted keeping its hours unlinked.
  return { taskId: null, projectId: null };
};

// An employee can't be in two places at once: reject a log that overlaps another of their own
// entries (including one that ran past midnight from the previous day) so totals never double-count.
const findOverlap = async (userId, { workDate, startTime, durationMinutes }, excludeId, transaction) => {
  const base = dayIndex(workDate);
  const start = toMinutes(startTime);
  const end = start + durationMinutes;

  const where = { userId, workDate: { [Op.between]: [dateFromIndex(base - 1), dateFromIndex(base + 1)] } };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const others = await TimesheetEntry.findAll({ where, transaction });

  return others.find((o) => {
    const oStart = (dayIndex(o.workDate) - base) * 1440 + toMinutes(o.startTime);
    return start < oStart + o.durationMinutes && oStart < end;
  });
};

// ---------- labels & history ----------

const taskLabelOf = (entry) => {
  const projectName = entry.project?.name || entry.deletedProjectName;
  if (entry.task) return projectName ? `${entry.task.title} (${projectName})` : entry.task.title;
  if (entry.deletedTaskTitle) return `${entry.deletedTaskTitle} (task removed)`;
  if (projectName) return `Project: ${projectName}`;
  return "—";
};

const entrySummaryLines = (entry, { includeTask }) => [
  ...(includeTask ? [`Task: ${taskLabelOf(entry)}`] : []),
  `Date: ${formatDisplayDate(entry.workDate)}`,
  `Duration: ${formatDuration(entry.durationMinutes)}`,
];

// One line per thing that changed — the history entry shows exactly what an edit did.
const diffLines = (before, after) => {
  const lines = [];
  if (before.durationMinutes !== after.durationMinutes) {
    lines.push(`Duration changed from ${formatDuration(before.durationMinutes)} → ${formatDuration(after.durationMinutes)}`);
  }
  if (before.startTime !== after.startTime || before.endTime !== after.endTime || before.endsNextDay !== after.endsNextDay) {
    lines.push(`Time changed from ${formatRange(before)} → ${formatRange(after)}`);
  }
  if (before.workDate !== after.workDate) {
    lines.push(`Date changed from ${formatDisplayDate(before.workDate)} → ${formatDisplayDate(after.workDate)}`);
  }
  if (taskLabelOf(before) !== taskLabelOf(after)) {
    lines.push(`Task changed from ${taskLabelOf(before)} → ${taskLabelOf(after)}`);
  }
  if (before.description !== after.description) lines.push("Work description updated");
  if ((before.notes || null) !== (after.notes || null)) lines.push("Notes updated");
  return lines;
};

// The employee-facing history lives on the TIMESHEET entity; entries booked against a task are
// mirrored onto that task's own activity feed (without the free-text work description) so the
// task timeline also shows who logged time on it.
const recordActivity = async ({ action, entry, actorId, lines, taskLines }, transaction) => {
  // subjectUserId is the employee the entry belongs to. It can differ from the actor now that only
  // Admin edits/deletes, so an employee's history also shows what an Admin did to their logs.
  const subjectUserId = entry.userId;
  const whose = actorId !== entry.userId ? [`Employee: ${entry.user?.name || `#${entry.userId}`}`] : [];
  await logActivity({ entityType: "TIMESHEET", entityId: entry.id, action, actorId, subjectUserId, note: [...whose, ...lines].join("\n") }, transaction);
  if (entry.taskId) {
    const mirrored = taskLines?.length ? taskLines : entrySummaryLines(entry, { includeTask: false });
    await logActivity({ entityType: "TASK", entityId: entry.taskId, action, actorId, subjectUserId, note: [...whose, ...mirrored].join("\n") }, transaction);
  }
};

// ---------- scope / filters ----------

// Employees add their own logs; correcting or removing one is an Admin action.
const isAdmin = (user) => user.roleName === "Admin";

// A RUNNING entry has no endTime/durationMinutes yet, so it can't go through the normal
// edit/delete path (which would just 409 — see updateTimesheet/deleteTimesheet) until stopped.
const serialize = (entry, user) => ({ ...entry.toJSON(), canEdit: isAdmin(user) && entry.status !== "RUNNING" });

// Non-admins see only their own entries unless granted "view all records" on /timesheets in
// Settings → Route Setting (Admin always can). The scope is decided server-side; a userId filter
// from the client is honoured only for viewers of all records.
const buildFilters = async (req) => {
  const viewAll = await canViewAllRecords(req.user, ROUTE_PATH);
  const { userId, taskId, projectId, date, from, to } = req.query;
  const where = {};

  if (!viewAll) where.userId = req.user.id;
  else if (userId) {
    const id = toId(userId);
    if (!id) return { error: "Invalid employee filter" };
    where.userId = id;
  }
  if (taskId) {
    const id = toId(taskId);
    if (!id) return { error: "Invalid task filter" };
    where.taskId = id;
  }
  if (projectId) {
    const id = toId(projectId);
    if (!id) return { error: "Invalid project filter" };
    where.projectId = id;
  }

  const rangeFrom = date || from;
  const rangeTo = date || to;
  if ((rangeFrom && !isRealDate(rangeFrom)) || (rangeTo && !isRealDate(rangeTo))) {
    return { error: "Dates must be in YYYY-MM-DD format" };
  }
  if (rangeFrom && rangeTo && rangeFrom > rangeTo) return { error: "The start date cannot be after the end date" };
  if (rangeFrom && rangeTo) where.workDate = { [Op.between]: [rangeFrom, rangeTo] };
  else if (rangeFrom) where.workDate = { [Op.gte]: rangeFrom };
  else if (rangeTo) where.workDate = { [Op.lte]: rangeTo };

  return { where, viewAll };
};

const fail = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

// ---------- handlers ----------

// GET /timesheets — the entries (newest day first, earliest start first within a day) plus the
// total minutes across the whole filtered set, not just the current page.
exports.getTimesheets = async (req, res) => {
  try {
    const { where, error } = await buildFilters(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);

    const [{ rows, count }, totalMinutes] = await Promise.all([
      TimesheetEntry.findAndCountAll({
        where,
        include: ENTRY_INCLUDE,
        order: [["workDate", "DESC"], ["startTime", "ASC"], ["id", "ASC"]],
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      }),
      TimesheetEntry.sum("durationMinutes", { where }),
    ]);

    return res.status(200).json({
      success: true,
      data: rows.map((row) => serialize(row, req.user)),
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
      summary: { totalMinutes: totalMinutes || 0 },
    });
  } catch (err) {
    return fail(res, err);
  }
};

// GET /timesheets/summary — totals for the same filters, broken down by day, task and employee
// (drives the weekly view and the "time spent per task" report).
exports.getTimesheetSummary = async (req, res) => {
  try {
    const { where, error } = await buildFilters(req);
    if (error) return res.status(400).json({ success: false, message: error });

    const sumMinutes = [fn("SUM", col("durationMinutes")), "minutes"];
    const [byDateRows, byTaskRows, byUserRows, entryCount] = await Promise.all([
      TimesheetEntry.findAll({ attributes: ["workDate", sumMinutes], where, group: ["workDate"], order: [["workDate", "ASC"]], raw: true }),
      TimesheetEntry.findAll({
        attributes: ["taskId", "projectId", "deletedTaskTitle", "deletedProjectName", sumMinutes],
        where,
        group: ["taskId", "projectId", "deletedTaskTitle", "deletedProjectName"],
        raw: true,
      }),
      TimesheetEntry.findAll({ attributes: ["userId", sumMinutes], where, group: ["userId"], raw: true }),
      TimesheetEntry.count({ where }),
    ]);

    const taskIds = byTaskRows.map((r) => r.taskId).filter(Boolean);
    const projectIds = byTaskRows.map((r) => r.projectId).filter(Boolean);
    const userIds = byUserRows.map((r) => r.userId);
    const [tasks, projects, users] = await Promise.all([
      taskIds.length ? Task.findAll({ where: { id: { [Op.in]: taskIds } }, attributes: ["id", "title", "status"] }) : [],
      projectIds.length ? Project.findAll({ where: { id: { [Op.in]: projectIds } }, attributes: ["id", "name"] }) : [],
      userIds.length ? User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ["id", "name"] }) : [],
    ]);
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userById = new Map(users.map((u) => [u.id, u]));

    const byDate = byDateRows.map((r) => ({ date: r.workDate, minutes: Number(r.minutes) }));
    const byTask = byTaskRows
      .map((r) => ({
        taskId: r.taskId,
        title: taskById.get(r.taskId)?.title || r.deletedTaskTitle || null,
        status: taskById.get(r.taskId)?.status || null,
        projectId: r.projectId,
        projectName: projectById.get(r.projectId)?.name || r.deletedProjectName || null,
        minutes: Number(r.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes);
    const byUser = byUserRows
      .map((r) => ({ userId: r.userId, name: userById.get(r.userId)?.name || `#${r.userId}`, minutes: Number(r.minutes) }))
      .sort((a, b) => b.minutes - a.minutes);

    return res.status(200).json({
      success: true,
      data: { totalMinutes: byDate.reduce((sum, d) => sum + d.minutes, 0), entryCount, byDate, byTask, byUser },
    });
  } catch (err) {
    return fail(res, err);
  }
};

// GET /timesheets/options — what the Add Work Log form's pickers and the filter bar can offer this
// user: the tasks/projects they can see (same visibility as the Tasks/Projects modules) and, for
// viewers of all records, the employee list.
exports.getTimesheetOptions = async (req, res) => {
  try {
    const viewAll = await canViewAllRecords(req.user, ROUTE_PATH);
    const [taskScope, projectScope] = await Promise.all([buildTaskScopeWhere(req.user), buildProjectScopeWhere(req.user)]);

    const [tasks, projects, users] = await Promise.all([
      Task.findAll({
        where: taskScope,
        attributes: ["id", "title", "status", "projectId"],
        include: [{ model: Project, as: "project", attributes: ["id", "name"] }],
        // Open work first — finished/cancelled tasks stay selectable for late entries.
        order: [[sequelize.literal("`Task`.`status` IN ('COMPLETED','CANCELLED')"), "ASC"], ["updatedAt", "DESC"]],
        limit: MAX_OPTION_ROWS,
      }),
      Project.findAll({ where: projectScope, attributes: ["id", "name", "status"], order: [["name", "ASC"]], limit: MAX_OPTION_ROWS }),
      viewAll ? User.findAll({ where: { deletedAt: null }, attributes: ["id", "name"], order: [["name", "ASC"]] }) : [],
    ]);

    return res.status(200).json({ success: true, data: { canViewAll: viewAll, tasks, projects, users } });
  } catch (err) {
    return fail(res, err);
  }
};

// GET /timesheets/activity — the timesheet history feed ("John added a timesheet entry …"),
// newest first. Same scope as the list: own history, or everyone's for viewers of all records.
exports.getTimesheetActivity = async (req, res) => {
  try {
    const viewAll = await canViewAllRecords(req.user, ROUTE_PATH);
    const where = { entityType: "TIMESHEET" };
    // "Whose entry" is subjectUserId; rows written before that column existed have none and were
    // always made by the owner, so they fall back to the actor.
    const ownedBy = (id) => ({ [Op.or]: [{ subjectUserId: id }, { subjectUserId: null, actorId: id }] });
    if (!viewAll) Object.assign(where, ownedBy(req.user.id));
    else if (req.query.userId) {
      const id = toId(req.query.userId);
      if (!id) return res.status(400).json({ success: false, message: "Invalid employee filter" });
      Object.assign(where, ownedBy(id));
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const { rows, count } = await ActivityLog.findAndCountAll({
      where,
      include: [
        { model: User, as: "actor", attributes: ["id", "name"] },
        { model: User, as: "subject", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit,
      offset: (page - 1) * limit,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    });
  } catch (err) {
    return fail(res, err);
  }
};

// GET /timesheets/active — the caller's own currently-running timers (used to restore the timer
// bar's state after a page refresh/login). An employee may have several running at once — see
// startTimesheet below — so this is a list, oldest-started first. Never reports another user's
// running timers — starting/stopping is a personal action, unlike the shared visibility
// getTimesheets offers.
exports.getActiveTimesheet = async (req, res) => {
  try {
    const entries = await TimesheetEntry.findAll({
      where: { userId: req.user.id, status: "RUNNING" },
      include: ENTRY_INCLUDE,
      order: [["startedAt", "ASC"]],
    });
    return res.status(200).json({ success: true, data: entries.map((entry) => serialize(entry, req.user)) });
  } catch (err) {
    return fail(res, err);
  }
};

// POST /timesheets/start — begins a live timer for the current user. Several may run at once (an
// employee genuinely working two tasks in parallel, e.g. while one is waiting on something) — the
// only thing rejected outright is starting the *same* task/project/Other-Work a second time while
// it's already running, since that's a duplicate click rather than a second real thread of work.
exports.startTimesheet = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;

    const taskId = toId(req.body?.taskId ?? null);
    const projectId = toId(req.body?.projectId ?? null);
    if (Number.isNaN(taskId) || Number.isNaN(projectId)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Invalid task or project" });
    }

    const links = await resolveLinks({ taskId, projectId }, null, user, t);
    if (links.error) {
      await t.rollback();
      return res.status(links.status).json({ success: false, message: links.error });
    }

    const duplicate = await TimesheetEntry.findOne({
      where: { userId: user.id, status: "RUNNING", taskId: links.taskId, projectId: links.projectId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (duplicate) {
      await t.rollback();
      return res.status(409).json({ success: false, message: "You already have a timer running for this — stop it before starting another one for the same work" });
    }

    const now = new Date();
    const { workDate, clockTime } = partsOf(now);

    const created = await TimesheetEntry.create(
      {
        userId: user.id,
        taskId: links.taskId,
        projectId: links.projectId,
        workDate,
        description: "",
        startTime: clockTime,
        endTime: null,
        endsNextDay: false,
        durationMinutes: null,
        status: "RUNNING",
        startedAt: now,
        notes: null,
      },
      { transaction: t }
    );
    const entry = await TimesheetEntry.findByPk(created.id, { include: ENTRY_INCLUDE, transaction: t });

    await t.commit();
    return res.status(201).json({ success: true, message: "Timer started", data: serialize(entry, user) });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return fail(res, err);
  }
};

// PATCH /timesheets/:id/stop — completes the caller's own running timer. Description is collected
// here (not at Start) so starting stays one click; everything else about the resulting row is
// computed, not typed, from the real startedAt/now instants.
exports.stopTimesheet = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const existing = await TimesheetEntry.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!existing) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Timesheet entry not found" });
    }
    if (existing.status !== "RUNNING") {
      await t.rollback();
      return res.status(400).json({ success: false, message: "This entry is not running" });
    }
    if (existing.userId !== user.id) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "You can only stop your own timer" });
    }

    const description = cleanText(req.body?.description);
    if (!description) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Describe the work you did" });
    }
    if (typeof description !== "string" || description.length > MAX_TEXT_LENGTH) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `Work description must be under ${MAX_TEXT_LENGTH} characters` });
    }
    const notes = cleanText(req.body?.notes) || null;
    if (notes && (typeof notes !== "string" || notes.length > MAX_TEXT_LENGTH)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `Notes must be under ${MAX_TEXT_LENGTH} characters` });
    }

    const now = new Date();
    const { clockTime: endTime } = partsOf(now);
    const endsNextDay = dayIndex(partsOf(now).workDate) > dayIndex(existing.workDate);

    // Duration comes from the real startedAt→now instants, not from diffing "HH:mm" strings —
    // those only have minute granularity, so a session stopped within the same clock-minute it
    // started (a normal, short timer run) would otherwise look like end <= start and be rejected.
    // Round up so a sub-minute session still logs as "1m" instead of "0m"/an error.
    const rawMinutes = (now.getTime() - new Date(existing.startedAt).getTime()) / 60000;
    if (rawMinutes >= 1440) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "A single work log cannot be 24 hours or longer" });
    }
    const durationMinutes = Math.max(1, Math.round(rawMinutes));

    // No overlap check here (unlike createTimesheet/updateTimesheet below): a stopped timer is
    // expected to overlap another of the employee's entries whenever two timers were run in
    // parallel — see startTimesheet — so that would reject a legitimate stop, not catch a mistake.

    await existing.update(
      { description, notes, endTime, endsNextDay, durationMinutes, status: "COMPLETED", endedAt: now },
      { transaction: t }
    );
    const entry = await TimesheetEntry.findByPk(existing.id, { include: ENTRY_INCLUDE, transaction: t });

    await recordActivity(
      {
        action: "TIMESHEET_ADDED",
        entry,
        actorId: user.id,
        lines: entrySummaryLines(entry, { includeTask: true }),
        taskLines: entrySummaryLines(entry, { includeTask: false }),
      },
      t
    );

    await t.commit();
    return res.status(200).json({ success: true, message: "Timer stopped", data: serialize(entry, user) });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return fail(res, err);
  }
};

// POST /timesheets — the employee is always the logged-in user; a userId in the body is ignored.
exports.createTimesheet = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const candidate = buildCandidate(null, req.body || {});

    const invalid = validateCandidate(candidate);
    if (invalid) {
      await t.rollback();
      return res.status(400).json({ success: false, message: invalid });
    }
    const duration = computeDuration(candidate);
    if (duration.error) {
      await t.rollback();
      return res.status(400).json({ success: false, message: duration.error });
    }
    const links = await resolveLinks(candidate, null, user, t);
    if (links.error) {
      await t.rollback();
      return res.status(links.status).json({ success: false, message: links.error });
    }

    const overlap = await findOverlap(user.id, { ...candidate, durationMinutes: duration.minutes }, null, t);
    if (overlap) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `This overlaps another of your entries (${formatRange(overlap)} on ${formatDisplayDate(overlap.workDate)})`,
      });
    }

    const created = await TimesheetEntry.create(
      {
        userId: user.id,
        taskId: links.taskId,
        projectId: links.projectId,
        workDate: candidate.workDate,
        description: candidate.description,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        endsNextDay: candidate.endsNextDay,
        durationMinutes: duration.minutes,
        notes: candidate.notes,
      },
      { transaction: t }
    );
    const entry = await TimesheetEntry.findByPk(created.id, { include: ENTRY_INCLUDE, transaction: t });

    await recordActivity(
      {
        action: "TIMESHEET_ADDED",
        entry,
        actorId: user.id,
        lines: entrySummaryLines(entry, { includeTask: true }),
        taskLines: entrySummaryLines(entry, { includeTask: false }),
      },
      t
    );

    await t.commit();
    return res.status(201).json({ success: true, message: "Work log added", data: serialize(entry, user) });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return fail(res, err);
  }
};

// PUT /timesheets/:id — owner only. Fields not supplied keep their current value.
exports.updateTimesheet = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const existing = await TimesheetEntry.findByPk(req.params.id, { include: ENTRY_INCLUDE, transaction: t, lock: t.LOCK.UPDATE });
    if (!existing) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Timesheet entry not found" });
    }
    if (!isAdmin(user)) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can edit timesheet entries" });
    }
    if (existing.status === "RUNNING") {
      await t.rollback();
      return res.status(409).json({ success: false, message: "This timer is still running — stop it before editing or deleting it" });
    }

    const candidate = buildCandidate(existing, req.body || {});
    const invalid = validateCandidate(candidate);
    if (invalid) {
      await t.rollback();
      return res.status(400).json({ success: false, message: invalid });
    }
    const duration = computeDuration(candidate);
    if (duration.error) {
      await t.rollback();
      return res.status(400).json({ success: false, message: duration.error });
    }
    const links = await resolveLinks(candidate, existing, user, t);
    if (links.error) {
      await t.rollback();
      return res.status(links.status).json({ success: false, message: links.error });
    }
    // Overlap is judged against the entry's owner, not the Admin making the correction.
    const overlap = await findOverlap(existing.userId, { ...candidate, durationMinutes: duration.minutes }, existing.id, t);
    if (overlap) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `This overlaps another of your entries (${formatRange(overlap)} on ${formatDisplayDate(overlap.workDate)})`,
      });
    }

    // Snapshot before mutating — `existing` is updated in place below.
    const before = {
      workDate: existing.workDate,
      startTime: existing.startTime,
      endTime: existing.endTime,
      endsNextDay: existing.endsNextDay,
      durationMinutes: existing.durationMinutes,
      description: existing.description,
      notes: existing.notes,
      task: existing.task,
      project: existing.project,
      deletedTaskTitle: existing.deletedTaskTitle,
      deletedProjectName: existing.deletedProjectName,
    };

    await existing.update(
      {
        updatedBy: user.id,
        taskId: links.taskId,
        projectId: links.projectId,
        workDate: candidate.workDate,
        description: candidate.description,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        endsNextDay: candidate.endsNextDay,
        durationMinutes: duration.minutes,
        notes: candidate.notes,
      },
      { transaction: t }
    );
    const entry = await TimesheetEntry.findByPk(existing.id, { include: ENTRY_INCLUDE, transaction: t });

    const lines = diffLines(before, entry);
    if (lines.length) {
      await recordActivity(
        {
          action: "TIMESHEET_UPDATED",
          entry,
          actorId: user.id,
          lines,
          // Task-feed copy omits the free-text bits and the task change itself (it is the task).
          taskLines: lines.filter((l) => !l.startsWith("Task changed") && l !== "Work description updated" && l !== "Notes updated"),
        },
        t
      );
    }

    await t.commit();
    return res.status(200).json({ success: true, message: lines.length ? "Work log updated" : "No change", data: serialize(entry, user) });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return fail(res, err);
  }
};

// DELETE /timesheets/:id — owner only. The history entry is kept after the row is gone.
exports.deleteTimesheet = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const entry = await TimesheetEntry.findByPk(req.params.id, { include: ENTRY_INCLUDE, transaction: t, lock: t.LOCK.UPDATE });
    if (!entry) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Timesheet entry not found" });
    }
    if (!isAdmin(user)) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can delete timesheet entries" });
    }
    if (entry.status === "RUNNING") {
      await t.rollback();
      return res.status(409).json({ success: false, message: "This timer is still running — stop it before editing or deleting it" });
    }

    await recordActivity(
      {
        action: "TIMESHEET_DELETED",
        entry,
        actorId: user.id,
        lines: [...entrySummaryLines(entry, { includeTask: true }), `Time: ${formatRange(entry)}`],
        taskLines: entrySummaryLines(entry, { includeTask: false }),
      },
      t
    );
    await entry.destroy({ transaction: t });

    await t.commit();
    return res.status(200).json({ success: true, message: "Work log deleted" });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return fail(res, err);
  }
};
