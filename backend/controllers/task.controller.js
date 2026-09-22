const { Task, TaskAssignee, TaskStatusHistory, TaskNote, Project, ProjectMember, User, ActivityLog } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { notify } = require("../services/notification.service");
const { canViewAllRecords } = require("../helper/permissionScope");
const { logActivity } = require("../services/activityLog.service");
const { deleteTasksCascade } = require("../services/taskDeletion.service");

const TASK_TYPES = ["ADMIN_TO_EMPLOYEE", "EMPLOYEE_TO_EMPLOYEE", "PROJECT_TASK"];
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "COMPLETED", "CANCELLED"];
const MAX_NOTE_LENGTH = 5000;

const ASSIGNEE_INCLUDE = {
  model: TaskAssignee,
  as: "assignees",
  where: { removedAt: null },
  required: false,
  separate: true,
  include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }],
};

/**
 * List/visibility scope for a non-admin (without /tasks viewAllRecords): tasks they created,
 * tasks they're actively assigned to, or — for PROJECT_TASK — any task under a project they're
 * an active member of (a project's task board is visible to the whole project, not just each
 * person's own assignments).
 */
const buildTaskScopeWhere = async (jwtUser) => {
  if (jwtUser.roleName === "Admin" || (await canViewAllRecords(jwtUser, "/tasks"))) {
    return {};
  }

  const [assigneeRows, memberRows] = await Promise.all([
    TaskAssignee.findAll({ where: { userId: jwtUser.id, removedAt: null }, attributes: ["taskId"] }),
    ProjectMember.findAll({ where: { userId: jwtUser.id, removedAt: null }, attributes: ["projectId"] }),
  ]);
  const assignedTaskIds = assigneeRows.map((r) => r.taskId);
  const memberProjectIds = memberRows.map((r) => r.projectId);

  const or = [{ createdBy: jwtUser.id }];
  if (assignedTaskIds.length) or.push({ id: { [Op.in]: assignedTaskIds } });
  if (memberProjectIds.length) or.push({ projectId: { [Op.in]: memberProjectIds } });
  return { [Op.or]: or };
};

const canViewTask = async (task, jwtUser, transaction) => {
  if (jwtUser.roleName === "Admin" || (await canViewAllRecords(jwtUser, "/tasks"))) return true;
  if (task.createdBy === jwtUser.id) return true;
  const activeAssignment = await TaskAssignee.findOne({ where: { taskId: task.id, userId: jwtUser.id, removedAt: null }, transaction });
  if (activeAssignment) return true;
  if (task.taskType === "PROJECT_TASK" && task.projectId) {
    const membership = await ProjectMember.findOne({ where: { projectId: task.projectId, userId: jwtUser.id, removedAt: null }, transaction });
    if (membership) return true;
  }
  return false;
};

// Status updates / work logs / comments / attachments (phases 2-3): Admin, creator, or an
// active assignee — being a project member alone does not grant these (only visibility does).
const canActOnTask = async (task, jwtUser, transaction) => {
  if (jwtUser.roleName === "Admin") return true;
  if (task.createdBy === jwtUser.id) return true;
  const activeAssignment = await TaskAssignee.findOne({ where: { taskId: task.id, userId: jwtUser.id, removedAt: null }, transaction });
  return !!activeAssignment;
};

// Adding/removing assignees ("sub-assign"): the spec says "if they have permission" without
// defining it — operationalized here as "you must already be part of the task" (Admin, creator,
// or an active assignee), same population as canActOnTask.
const canManageAssignees = canActOnTask;

// Editing title/description/priority/dates: Admin or the task's original creator only —
// deliberately narrower than canActOnTask (an assignee can update status/work logs but not
// rewrite what the task actually is).
const canEditTaskFields = (task, jwtUser) => jwtUser.roleName === "Admin" || task.createdBy === jwtUser.id;

// Adding notes: Admin or someone currently assigned to the task — a creator who is no longer
// assigned (e.g. after reassigning it away) can still see the task but can't add notes.
const canNoteOnTask = async (task, jwtUser, transaction) => {
  if (jwtUser.roleName === "Admin") return true;
  const activeAssignment = await TaskAssignee.findOne({ where: { taskId: task.id, userId: jwtUser.id, removedAt: null }, transaction });
  return !!activeAssignment;
};

const namesOf = (users) => users.map((u) => u.name).join(", ");

const findUsersByIds = (ids, transaction) => User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name"], transaction });

const isNumericId = (value) => !!value && /^\d+$/.test(value);

// Assignee activity rows written before names were stored hold raw user ids in old/newValue —
// resolve those to names on read so the timeline is always human-readable.
const fetchTaskActivity = async (taskId) => {
  const rows = await ActivityLog.findAll({
    where: { entityType: "TASK", entityId: taskId },
    include: [{ model: User, as: "actor", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
  });
  const isAssigneeAction = (r) => r.action === "ASSIGNEE_ADDED" || r.action === "ASSIGNEE_REMOVED";
  const legacyIds = [
    ...new Set(
      rows
        .filter(isAssigneeAction)
        .flatMap((r) => [r.oldValue, r.newValue])
        .filter(isNumericId)
        .map(Number)
    ),
  ];
  if (!legacyIds.length) return rows;
  const nameById = new Map((await findUsersByIds(legacyIds)).map((u) => [u.id, u.name]));
  const resolve = (v) => (isNumericId(v) ? nameById.get(Number(v)) || v : v);
  return rows.map((r) => {
    const json = r.toJSON();
    if (isAssigneeAction(r)) {
      json.oldValue = resolve(json.oldValue);
      json.newValue = resolve(json.newValue);
    }
    return json;
  });
};

const fetchTaskNotes = (taskId) =>
  TaskNote.findAll({
    where: { taskId },
    include: [{ model: User, as: "author", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
  });

// GET /tasks
exports.getTasks = async (req, res) => {
  try {
    const scopeWhere = await buildTaskScopeWhere(req.user);
    const conditions = [scopeWhere];

    if (req.query.status && TASK_STATUSES.includes(req.query.status)) conditions.push({ status: req.query.status });
    if (req.query.priority && TASK_PRIORITIES.includes(req.query.priority)) conditions.push({ priority: req.query.priority });
    if (req.query.taskType && TASK_TYPES.includes(req.query.taskType)) conditions.push({ taskType: req.query.taskType });
    if (req.query.projectId) conditions.push({ projectId: req.query.projectId });

    if (req.query.search && req.query.search.trim()) {
      const like = `%${req.query.search.trim()}%`;
      conditions.push({ [Op.or]: [{ title: { [Op.like]: like } }, { description: { [Op.like]: like } }] });
    }

    if (req.query.assigneeId) {
      const rows = await TaskAssignee.findAll({ where: { userId: req.query.assigneeId, removedAt: null }, attributes: ["taskId"] });
      const ids = rows.map((r) => r.taskId);
      conditions.push({ id: { [Op.in]: ids.length ? ids : [0] } });
    }

    const where = { [Op.and]: conditions };

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await Task.findAndCountAll({
      where,
      include: [
        { model: Project, as: "project", attributes: ["id", "name"] },
        { model: User, as: "creator", attributes: ["id", "name"] },
        ASSIGNEE_INCLUDE,
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// GET /tasks/:id
exports.getTaskById = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id, {
      include: [
        { model: Project, as: "project", attributes: ["id", "name", "taskCreationPermission"] },
        { model: User, as: "creator", attributes: ["id", "name", "email"] },
        { model: User, as: "completer", attributes: ["id", "name", "email"] },
        ASSIGNEE_INCLUDE,
        {
          model: TaskStatusHistory,
          as: "statusHistory",
          separate: true,
          order: [["changedAt", "ASC"]],
          include: [{ model: User, as: "changedByUser", attributes: ["id", "name"] }],
        },
      ],
    });
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!(await canViewTask(task, req.user))) {
      return res.status(403).json({ success: false, message: "Access denied: this task is outside your allowed scope" });
    }

    const [activity, notes] = await Promise.all([fetchTaskActivity(task.id), fetchTaskNotes(task.id)]);

    return res.status(200).json({ success: true, data: { ...task.toJSON(), activityLog: activity, notes } });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// POST /tasks
exports.createTask = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { title, description, taskType, projectId, priority, startAt, dueAt, assigneeIds } = req.body || {};

    if (!title || !title.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Task title is required" });
    }
    if (!TASK_TYPES.includes(taskType)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `taskType must be one of: ${TASK_TYPES.join(", ")}` });
    }
    if (priority !== undefined && !TASK_PRIORITIES.includes(priority)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `priority must be one of: ${TASK_PRIORITIES.join(", ")}` });
    }

    if (taskType === "ADMIN_TO_EMPLOYEE" && user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can create an Admin → Employee task" });
    }

    let resolvedProjectId = null;
    if (taskType === "PROJECT_TASK") {
      if (!projectId) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "projectId is required for project tasks" });
      }
      const project = await Project.findByPk(projectId, { transaction: t, lock: true });
      if (!project) {
        await t.rollback();
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      if (user.roleName !== "Admin") {
        const isMember = await ProjectMember.findOne({ where: { projectId, userId: user.id, removedAt: null }, transaction: t });
        const allowed = !!isMember && project.taskCreationPermission === "ADMIN_AND_MEMBERS";
        if (!allowed) {
          await t.rollback();
          return res.status(403).json({ success: false, message: "You do not have permission to create tasks in this project" });
        }
      }
      resolvedProjectId = project.id;
    }

    const task = await Task.create(
      {
        title: title.trim(),
        description: description || null,
        taskType,
        projectId: resolvedProjectId,
        priority: priority || "MEDIUM",
        status: "PENDING",
        startAt: startAt || null,
        dueAt: dueAt || null,
        createdBy: user.id,
      },
      { transaction: t }
    );

    const uniqueAssigneeIds = [...new Set((Array.isArray(assigneeIds) ? assigneeIds : []).map(Number).filter(Boolean))];
    const assigneeUsers = uniqueAssigneeIds.length ? await findUsersByIds(uniqueAssigneeIds, t) : [];
    if (assigneeUsers.length !== uniqueAssigneeIds.length) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "One or more selected assignees were not found" });
    }
    for (const assignee of assigneeUsers) {
      await TaskAssignee.create({ taskId: task.id, userId: assignee.id, assignedBy: user.id, assignedAt: new Date() }, { transaction: t });
      await logActivity({ entityType: "TASK", entityId: task.id, action: "ASSIGNEE_ADDED", actorId: user.id, newValue: assignee.name }, t);
    }

    await TaskStatusHistory.create({ taskId: task.id, oldStatus: null, newStatus: "PENDING", changedBy: user.id, changedAt: new Date() }, { transaction: t });
    await logActivity({ entityType: "TASK", entityId: task.id, action: "TASK_CREATED", actorId: user.id, newValue: task.title }, t);

    await t.commit();

    const taskEvents = uniqueAssigneeIds.map((assigneeId) => ({
      recipientModule: "tasks",
      recipientUserId: assigneeId,
      type: "TASK_ASSIGNED",
      title: "New Task Assigned",
      message: `You have been assigned to "${task.title}".`,
      referenceType: "task",
      referenceId: task.id,
      event: "task_assigned",
      payload: { taskId: task.id },
    }));
    // Admin sees every task event regardless of whether they're the creator/assignee — a
    // broadcast on "admin" (same pattern as NEW_SALE/EXPENSE_PENDING_APPROVAL) rather than
    // relying on personal recipientUserId targeting like the assignee notifications above.
    taskEvents.push({
      recipientModule: "admin",
      type: "TASK_ASSIGNED",
      title: "New Task Created",
      message: `"${task.title}" was created by ${user.name || "a user"}${
        assigneeUsers.length ? `, assigned to ${namesOf(assigneeUsers)}` : ""
      }.`,
      referenceType: "task",
      referenceId: task.id,
      event: "task_assigned",
      payload: { taskId: task.id },
    });
    await notify(taskEvents);

    return res.status(201).json({ success: true, message: "Task created successfully", data: task });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// PUT /tasks/:id — field edits only; status changes go through updateTaskStatus below so every
// status transition is always paired with a task_status_history row.
exports.updateTask = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { title, description, priority, startAt, dueAt } = req.body || {};

    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!canEditTaskFields(task, user)) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only the task creator or Admin can edit this task" });
    }
    if (priority !== undefined && !TASK_PRIORITIES.includes(priority)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `priority must be one of: ${TASK_PRIORITIES.join(", ")}` });
    }

    const changes = [];
    if (title !== undefined && title.trim() && title.trim() !== task.title) {
      changes.push({ action: "TASK_UPDATED", oldValue: task.title, newValue: title.trim() });
      task.title = title.trim();
    }
    if (description !== undefined && (description || null) !== task.description) {
      changes.push({ action: "DESCRIPTION_CHANGED", oldValue: task.description, newValue: description });
      task.description = description || null;
    }
    if (priority !== undefined && priority !== task.priority) {
      changes.push({ action: "PRIORITY_CHANGED", oldValue: task.priority, newValue: priority });
      task.priority = priority;
    }
    if (dueAt !== undefined) {
      const newDueAt = dueAt || null;
      if (String(task.dueAt) !== String(newDueAt)) {
        changes.push({ action: "DUE_DATE_CHANGED", oldValue: task.dueAt, newValue: newDueAt });
        task.dueAt = newDueAt;
      }
    }
    if (startAt !== undefined) {
      const newStartAt = startAt || null;
      if (String(task.startAt) !== String(newStartAt)) {
        changes.push({ action: "TASK_UPDATED", oldValue: task.startAt, newValue: newStartAt, note: "start date" });
        task.startAt = newStartAt;
      }
    }

    if (changes.length) {
      await task.save({ transaction: t });
    }
    for (const change of changes) {
      await logActivity({ entityType: "TASK", entityId: task.id, actorId: user.id, ...change }, t);
    }

    await t.commit();
    return res.status(200).json({ success: true, message: "Task updated successfully", data: task });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// PUT /tasks/:id/status — no backward-rank restriction (unlike Courier): the spec explicitly
// wants a task movable back out of COMPLETED ("Task reopened"), so any allowed actor may set any
// status; the semantics (complete vs reopen) are captured via the extra activity log entries and
// completedBy/completedAt bookkeeping below, not by blocking the transition.
exports.updateTaskStatus = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { status, note } = req.body || {};
    if (!TASK_STATUSES.includes(status)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `status must be one of: ${TASK_STATUSES.join(", ")}` });
    }

    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!(await canActOnTask(task, user, t))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Access denied: this task is outside your allowed scope" });
    }

    const previousStatus = task.status;
    if (status === previousStatus) {
      await t.rollback();
      return res.status(200).json({ success: true, message: "No change", data: task });
    }

    task.status = status;
    if (status === "COMPLETED") {
      task.completedBy = user.id;
      task.completedAt = new Date();
    } else if (previousStatus === "COMPLETED") {
      task.completedBy = null;
      task.completedAt = null;
    }
    await task.save({ transaction: t });

    await TaskStatusHistory.create(
      { taskId: task.id, oldStatus: previousStatus, newStatus: status, changedBy: user.id, changedAt: new Date(), note: note || null },
      { transaction: t }
    );
    await logActivity({ entityType: "TASK", entityId: task.id, action: "STATUS_CHANGED", actorId: user.id, oldValue: previousStatus, newValue: status, note }, t);
    if (status === "COMPLETED") {
      await logActivity({ entityType: "TASK", entityId: task.id, action: "TASK_COMPLETED", actorId: user.id }, t);
    } else if (previousStatus === "COMPLETED") {
      await logActivity({ entityType: "TASK", entityId: task.id, action: "TASK_REOPENED", actorId: user.id }, t);
    }

    await t.commit();

    const recipients = new Set();
    if (task.createdBy !== user.id) recipients.add(task.createdBy);
    const activeAssignees = await TaskAssignee.findAll({ where: { taskId: task.id, removedAt: null } });
    activeAssignees.forEach((a) => {
      if (a.userId !== user.id) recipients.add(a.userId);
    });

    const statusEvents = [...recipients].map((uid) => ({
      recipientModule: "tasks",
      recipientUserId: uid,
      type: "TASK_STATUS_CHANGED",
      title: "Task Status Updated",
      message: `"${task.title}" status changed to ${status}.`,
      referenceType: "task",
      referenceId: task.id,
      event: "task_status_changed",
      payload: { taskId: task.id, status },
    }));
    // Admin sees every status change regardless of their own involvement in the task.
    statusEvents.push({
      recipientModule: "admin",
      type: "TASK_STATUS_CHANGED",
      title: "Task Status Updated",
      message: `"${task.title}" status changed to ${status} by ${user.name || "a user"}.`,
      referenceType: "task",
      referenceId: task.id,
      event: "task_status_changed",
      payload: { taskId: task.id, status },
    });
    await notify(statusEvents);

    return res.status(200).json({ success: true, message: "Task status updated successfully", data: task });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// POST /tasks/:id/assignees — "sub-assign" (see canManageAssignees above).
exports.addTaskAssignees = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!(await canManageAssignees(task, user, t))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "You must already be part of this task to add assignees" });
    }

    const { assigneeIds } = req.body || {};
    const ids = [...new Set((Array.isArray(assigneeIds) ? assigneeIds : []).map(Number).filter(Boolean))];
    const nameById = new Map((await findUsersByIds(ids, t)).map((u) => [u.id, u.name]));
    const added = [];
    for (const assigneeId of ids) {
      if (!nameById.has(assigneeId)) continue;
      const existing = await TaskAssignee.findOne({ where: { taskId: task.id, userId: assigneeId, removedAt: null }, transaction: t });
      if (existing) continue;
      const row = await TaskAssignee.create({ taskId: task.id, userId: assigneeId, assignedBy: user.id, assignedAt: new Date() }, { transaction: t });
      added.push(row);
      await logActivity({ entityType: "TASK", entityId: task.id, action: "ASSIGNEE_ADDED", actorId: user.id, newValue: nameById.get(assigneeId) }, t);
    }

    await t.commit();

    if (added.length) {
      const addEvents = added.map((a) => ({
        recipientModule: "tasks",
        recipientUserId: a.userId,
        type: "TASK_ASSIGNED",
        title: "New Task Assigned",
        message: `You have been assigned to "${task.title}".`,
        referenceType: "task",
        referenceId: task.id,
        event: "task_assigned",
        payload: { taskId: task.id },
      }));
      const addedNames = added.map((a) => nameById.get(a.userId)).filter(Boolean).join(", ");
      addEvents.push({
        recipientModule: "admin",
        type: "TASK_ASSIGNED",
        title: "Task Assignees Updated",
        message: `${user.name || "A user"} added ${addedNames || "a new assignee"} to "${task.title}".`,
        referenceType: "task",
        referenceId: task.id,
        event: "task_assigned",
        payload: { taskId: task.id },
      });
      await notify(addEvents);
    }

    return res.status(200).json({ success: true, message: "Assignees added successfully", data: added });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /tasks/:id/assignees/:userId — soft-remove: the row stays for audit history (see
// taskAssignee.model.js).
exports.removeTaskAssignee = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { id, userId: assigneeUserId } = req.params;

    const task = await Task.findByPk(id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!(await canManageAssignees(task, user, t))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "You must already be part of this task to remove assignees" });
    }

    const membership = await TaskAssignee.findOne({
      where: { taskId: id, userId: assigneeUserId, removedAt: null },
      transaction: t,
      lock: true,
    });
    if (!membership) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Active assignee not found" });
    }

    membership.removedAt = new Date();
    membership.removedBy = user.id;
    await membership.save({ transaction: t });
    const removedUser = await User.findByPk(assigneeUserId, { attributes: ["id", "name"], transaction: t });
    await logActivity({ entityType: "TASK", entityId: task.id, action: "ASSIGNEE_REMOVED", actorId: user.id, oldValue: removedUser?.name || String(assigneeUserId) }, t);

    await t.commit();
    return res.status(200).json({ success: true, message: "Assignee removed successfully" });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// PUT /tasks/:id/assign — "reassign": hands the task over to exactly one person. Every current
// active assignee is soft-removed (rows stay for audit — see taskAssignee.model.js) and the
// target becomes the sole active assignee. Same actor rule as canManageAssignees (Admin,
// creator, or someone already on the task), so an employee can pass their task to a colleague
// but can't grab or shuffle tasks they have nothing to do with.
exports.reassignTask = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const assigneeId = Number(req.body?.assigneeId);
    if (!assigneeId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "assigneeId is required" });
    }

    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!(await canManageAssignees(task, user, t))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "You must already be part of this task to assign it" });
    }

    const target = await User.findByPk(assigneeId, { attributes: ["id", "name", "isActive"], transaction: t });
    if (!target || target.isActive === false) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "The selected user is not available for assignment" });
    }
    if (task.taskType === "PROJECT_TASK" && task.projectId) {
      const membership = await ProjectMember.findOne({ where: { projectId: task.projectId, userId: assigneeId, removedAt: null }, transaction: t });
      if (!membership) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Project tasks can only be assigned to members of the project" });
      }
    }

    const current = await TaskAssignee.findAll({
      where: { taskId: task.id, removedAt: null },
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (current.length === 1 && current[0].userId === assigneeId) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `Task is already assigned to ${target.name}` });
    }

    const now = new Date();
    for (const row of current) {
      if (row.userId === assigneeId) continue;
      row.removedAt = now;
      row.removedBy = user.id;
      await row.save({ transaction: t });
    }
    if (!current.some((r) => r.userId === assigneeId)) {
      await TaskAssignee.create({ taskId: task.id, userId: assigneeId, assignedBy: user.id, assignedAt: now }, { transaction: t });
    }

    // First assignment (nobody on it before) reads as "assigned"; otherwise "reassigned from X to Y".
    await logActivity(
      {
        entityType: "TASK",
        entityId: task.id,
        action: current.length ? "TASK_REASSIGNED" : "ASSIGNEE_ADDED",
        actorId: user.id,
        oldValue: current.length ? namesOf(current.map((r) => r.user).filter(Boolean)) : null,
        newValue: target.name,
      },
      t
    );

    await t.commit();

    const reassignEvents = [];
    if (assigneeId !== user.id) {
      reassignEvents.push({
        recipientModule: "tasks",
        recipientUserId: assigneeId,
        type: "TASK_ASSIGNED",
        title: "New Task Assigned",
        message: `You have been assigned to "${task.title}".`,
        referenceType: "task",
        referenceId: task.id,
        event: "task_assigned",
        payload: { taskId: task.id },
      });
    }
    // Admin sees every (re)assignment regardless of who performed it or who the assignee is.
    reassignEvents.push({
      recipientModule: "admin",
      type: "TASK_ASSIGNED",
      title: current.length ? "Task Reassigned" : "Task Assigned",
      message: `"${task.title}" was ${current.length ? "reassigned" : "assigned"} to ${target.name} by ${user.name || "a user"}.`,
      referenceType: "task",
      referenceId: task.id,
      event: "task_assigned",
      payload: { taskId: task.id },
    });
    await notify(reassignEvents);

    return res.status(200).json({ success: true, message: `Task assigned to ${target.name}`, data: task });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// GET /tasks/:id/activity — the persisted activity feed (newest first).
exports.getTaskActivity = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id, { attributes: ["id", "createdBy", "taskType", "projectId"] });
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });
    if (!(await canViewTask(task, req.user))) {
      return res.status(403).json({ success: false, message: "Access denied: this task is outside your allowed scope" });
    }
    return res.status(200).json({ success: true, data: await fetchTaskActivity(task.id) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// GET /tasks/:id/notes
exports.getTaskNotes = async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id, { attributes: ["id", "createdBy", "taskType", "projectId"] });
    if (!task) return res.status(404).json({ success: false, message: "Task not found" });
    if (!(await canViewTask(task, req.user))) {
      return res.status(403).json({ success: false, message: "Access denied: this task is outside your allowed scope" });
    }
    return res.status(200).json({ success: true, data: await fetchTaskNotes(task.id) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

const validateNoteContent = (raw) => {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return { error: "Note content is required" };
  if (content.length > MAX_NOTE_LENGTH) return { error: `Note must be under ${MAX_NOTE_LENGTH} characters` };
  return { content };
};

// POST /tasks/:id/notes
exports.addTaskNote = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { content, error } = validateNoteContent(req.body?.content);
    if (error) {
      await t.rollback();
      return res.status(400).json({ success: false, message: error });
    }

    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    if (!(await canNoteOnTask(task, user, t))) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin or the person currently assigned to this task can add notes" });
    }

    const note = await TaskNote.create({ taskId: task.id, content, createdBy: user.id }, { transaction: t });
    await logActivity({ entityType: "TASK", entityId: task.id, action: "NOTE_ADDED", actorId: user.id, newValue: content }, t);

    await t.commit();
    return res.status(201).json({ success: true, message: "Note added", data: note });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// PUT /tasks/:id/notes/:noteId — the previous text is kept in the NOTE_UPDATED activity entry.
// Admin may edit any note; an assignee may edit only their own.
exports.updateTaskNote = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { content, error } = validateNoteContent(req.body?.content);
    if (error) {
      await t.rollback();
      return res.status(400).json({ success: false, message: error });
    }

    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    const note = await TaskNote.findOne({ where: { id: req.params.noteId, taskId: task.id }, transaction: t, lock: true });
    if (!note) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Note not found" });
    }
    const isAdmin = user.roleName === "Admin";
    if (!(await canNoteOnTask(task, user, t)) || (!isAdmin && note.createdBy !== user.id)) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "You can only edit your own notes while assigned to this task" });
    }

    if (content === note.content) {
      await t.rollback();
      return res.status(200).json({ success: true, message: "No change", data: note });
    }

    const previous = note.content;
    note.content = content;
    await note.save({ transaction: t });
    await logActivity({ entityType: "TASK", entityId: task.id, action: "NOTE_UPDATED", actorId: user.id, oldValue: previous, newValue: content }, t);

    await t.commit();
    return res.status(200).json({ success: true, message: "Note updated", data: note });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /tasks/:id — Admin only, and it works for every task type (Admin → Employee,
// Employee → Employee, and project tasks). Hard delete: the task and everything attached to it
// (assignees, status history, notes, activity log) is removed, so this cannot be undone.
exports.deleteTask = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (req.user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can delete tasks" });
    }
    const task = await Task.findByPk(req.params.id, { transaction: t, lock: true });
    if (!task) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    await deleteTasksCascade([task.id], t);
    await t.commit();
    return res.status(200).json({ success: true, message: "Task deleted successfully" });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// Shared with timesheet.controller.js so a work log can only be booked against a task the user
// is allowed to see (same visibility rule as the task list/detail endpoints).
exports.canViewTask = canViewTask;
exports.buildTaskScopeWhere = buildTaskScopeWhere;
