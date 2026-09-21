const { Project, ProjectMember, Task, User, ActivityLog } = require("../models");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { canViewAllRecords } = require("../helper/permissionScope");
const { logActivity } = require("../services/activityLog.service");
const { deleteTasksCascade, deleteProjectChildren } = require("../services/taskDeletion.service");

const PROJECT_STATUSES = ["ACTIVE", "COMPLETED", "ARCHIVED"];
const TASK_CREATION_PERMISSIONS = ["ADMIN_ONLY", "ADMIN_AND_MEMBERS"];

const MEMBER_INCLUDE = {
  model: ProjectMember,
  as: "members",
  where: { removedAt: null },
  required: false,
  separate: true,
  include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }],
};

/**
 * Project access is membership-driven, not city/ownership-driven like Courier — a non-admin
 * (without /projects viewAllRecords) only sees projects they've been added to.
 */
const buildProjectScopeWhere = async (jwtUser) => {
  if (jwtUser.roleName === "Admin" || (await canViewAllRecords(jwtUser, "/projects"))) {
    return {};
  }

  const memberships = await ProjectMember.findAll({
    where: { userId: jwtUser.id, removedAt: null },
    attributes: ["projectId"],
  });
  const projectIds = memberships.map((m) => m.projectId);
  return { id: { [Op.in]: projectIds.length ? projectIds : [0] } };
};

const canAccessProject = async (project, jwtUser, transaction) => {
  if (jwtUser.roleName === "Admin" || (await canViewAllRecords(jwtUser, "/projects"))) return true;
  const membership = await ProjectMember.findOne({
    where: { projectId: project.id, userId: jwtUser.id, removedAt: null },
    transaction,
  });
  return !!membership;
};

// GET /projects
exports.getProjects = async (req, res) => {
  try {
    const scopeWhere = await buildProjectScopeWhere(req.user);
    const where = { ...scopeWhere };

    if (req.query.status && PROJECT_STATUSES.includes(req.query.status)) {
      where.status = req.query.status;
    }
    if (req.query.search && req.query.search.trim()) {
      where.name = { [Op.like]: `%${req.query.search.trim()}%` };
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const { rows, count } = await Project.findAndCountAll({
      where,
      include: [{ model: User, as: "creator", attributes: ["id", "name", "email"] }, MEMBER_INCLUDE],
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

// GET /projects/:id
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [{ model: User, as: "creator", attributes: ["id", "name", "email"] }, MEMBER_INCLUDE],
    });
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (!(await canAccessProject(project, req.user))) {
      return res.status(403).json({ success: false, message: "Access denied: you are not a member of this project" });
    }

    const tasks = await Task.findAll({
      where: { projectId: project.id },
      attributes: ["id", "title", "status", "priority", "dueAt", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    const activity = await ActivityLog.findAll({
      where: { entityType: "PROJECT", entityId: project.id },
      include: [{ model: User, as: "actor", attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    return res.status(200).json({
      success: true,
      data: { ...project.toJSON(), tasks, activityLog: activity },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// POST /projects — Admin only, per spec ("Only Admin can create a Project").
exports.createProject = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    if (user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can create projects" });
    }

    const { name, description, taskCreationPermission, memberIds } = req.body || {};
    if (!name || !name.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Project name is required" });
    }
    if (taskCreationPermission !== undefined && !TASK_CREATION_PERMISSIONS.includes(taskCreationPermission)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `taskCreationPermission must be one of: ${TASK_CREATION_PERMISSIONS.join(", ")}` });
    }

    const project = await Project.create(
      {
        name: name.trim(),
        description: description || null,
        status: "ACTIVE",
        taskCreationPermission: taskCreationPermission || "ADMIN_ONLY",
        createdBy: user.id,
      },
      { transaction: t }
    );

    const uniqueMemberIds = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(Number).filter(Boolean))];
    for (const memberId of uniqueMemberIds) {
      await ProjectMember.create({ projectId: project.id, userId: memberId, addedBy: user.id, addedAt: new Date() }, { transaction: t });
      await logActivity({ entityType: "PROJECT", entityId: project.id, action: "MEMBER_ADDED", actorId: user.id, newValue: String(memberId) }, t);
    }

    await logActivity({ entityType: "PROJECT", entityId: project.id, action: "PROJECT_CREATED", actorId: user.id, newValue: project.name }, t);

    await t.commit();
    return res.status(201).json({ success: true, message: "Project created successfully", data: project });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// PUT /projects/:id — Admin only.
exports.updateProject = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    if (user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can update projects" });
    }

    const { name, description, status, taskCreationPermission } = req.body || {};
    if (status !== undefined && !PROJECT_STATUSES.includes(status)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `status must be one of: ${PROJECT_STATUSES.join(", ")}` });
    }
    if (taskCreationPermission !== undefined && !TASK_CREATION_PERMISSIONS.includes(taskCreationPermission)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `taskCreationPermission must be one of: ${TASK_CREATION_PERMISSIONS.join(", ")}` });
    }

    const project = await Project.findByPk(req.params.id, { transaction: t, lock: true });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    let changed = false;
    if (name !== undefined && name.trim() && name.trim() !== project.name) {
      project.name = name.trim();
      changed = true;
    }
    if (description !== undefined && description !== project.description) {
      project.description = description || null;
      changed = true;
    }
    if (status !== undefined && status !== project.status) {
      project.status = status;
      changed = true;
    }
    if (taskCreationPermission !== undefined && taskCreationPermission !== project.taskCreationPermission) {
      project.taskCreationPermission = taskCreationPermission;
      changed = true;
    }

    if (changed) {
      await project.save({ transaction: t });
      await logActivity({ entityType: "PROJECT", entityId: project.id, action: "PROJECT_UPDATED", actorId: user.id }, t);
    }

    await t.commit();
    return res.status(200).json({ success: true, message: "Project updated successfully", data: project });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// POST /projects/:id/members — Admin only.
exports.addProjectMembers = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    if (user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can manage project members" });
    }

    const project = await Project.findByPk(req.params.id, { transaction: t, lock: true });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    const { memberIds } = req.body || {};
    const ids = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(Number).filter(Boolean))];
    const added = [];
    for (const memberId of ids) {
      const existing = await ProjectMember.findOne({ where: { projectId: project.id, userId: memberId, removedAt: null }, transaction: t });
      if (existing) continue;
      const row = await ProjectMember.create({ projectId: project.id, userId: memberId, addedBy: user.id, addedAt: new Date() }, { transaction: t });
      added.push(row);
      await logActivity({ entityType: "PROJECT", entityId: project.id, action: "MEMBER_ADDED", actorId: user.id, newValue: String(memberId) }, t);
    }

    await t.commit();
    return res.status(200).json({ success: true, message: "Members added successfully", data: added });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /projects/:id/members/:memberId — Admin only. Soft-remove: the row stays for audit
// history (see projectMember.model.js).
exports.removeProjectMember = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    if (user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can manage project members" });
    }

    const { id, memberId } = req.params;
    const membership = await ProjectMember.findOne({
      where: { projectId: id, userId: memberId, removedAt: null },
      transaction: t,
      lock: true,
    });
    if (!membership) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Active membership not found" });
    }

    membership.removedAt = new Date();
    membership.removedBy = user.id;
    await membership.save({ transaction: t });
    await logActivity({ entityType: "PROJECT", entityId: Number(id), action: "MEMBER_REMOVED", actorId: user.id, oldValue: String(memberId) }, t);

    await t.commit();
    return res.status(200).json({ success: true, message: "Member removed successfully" });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// DELETE /projects/:id — Admin only. Hard delete: the project, its members, and every task under
// it (with each task's assignees/notes/history/activity) are removed together, so this cannot be
// undone. Prefer setting the project's status to ARCHIVED when the history should be kept.
exports.deleteProject = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (req.user.roleName !== "Admin") {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Only Admin can delete projects" });
    }
    const project = await Project.findByPk(req.params.id, { transaction: t, lock: true });
    if (!project) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    const tasks = await Task.findAll({ where: { projectId: project.id }, attributes: ["id"], transaction: t, lock: true });
    await deleteTasksCascade(tasks.map((task) => task.id), t);
    await deleteProjectChildren(project.id, t);
    await project.destroy({ transaction: t });

    await t.commit();
    return res.status(200).json({ success: true, message: `Project deleted successfully (${tasks.length} task${tasks.length === 1 ? "" : "s"} removed)` });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

// Shared with timesheet.controller.js so a work log can only be booked against a project the
// user is allowed to see (same membership rule as the project list/detail endpoints).
exports.buildProjectScopeWhere = buildProjectScopeWhere;
exports.canAccessProject = canAccessProject;
