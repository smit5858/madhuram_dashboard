const { Op } = require("sequelize");
const { Task, TaskAssignee, TaskStatusHistory, TaskNote, ProjectMember, ActivityLog, Notification, Project, TimesheetEntry } = require("../models");

// Timesheet entries are logged hours, so they outlive the task/project they were booked against:
// the FK is nulled and the old title/name kept (deletedTaskTitle/deletedProjectName) so the entry
// still reads sensibly. Must run before the Task/Project row is destroyed.
const detachTimesheetsFromTasks = async (taskIds, transaction) => {
  const tasks = await Task.findAll({ where: { id: { [Op.in]: taskIds } }, attributes: ["id", "title"], transaction });
  for (const task of tasks) {
    await TimesheetEntry.update({ taskId: null, deletedTaskTitle: task.title }, { where: { taskId: task.id }, transaction });
  }
};

// Hard-deletes tasks together with everything that hangs off them — assignees, status history,
// notes, their activity-log entries, and the "task" notifications pointing at them — inside the
// caller's transaction. Used by DELETE /tasks/:id and DELETE /projects/:id (which removes the
// project's tasks first). Callers must enforce Admin-only access; this only does the deletion.
const deleteTasksCascade = async (taskIds, transaction) => {
  if (!taskIds.length) return;
  const byTask = { taskId: { [Op.in]: taskIds } };
  await detachTimesheetsFromTasks(taskIds, transaction);
  await TaskNote.destroy({ where: byTask, transaction });
  await TaskStatusHistory.destroy({ where: byTask, transaction });
  await TaskAssignee.destroy({ where: byTask, transaction });
  await ActivityLog.destroy({ where: { entityType: "TASK", entityId: { [Op.in]: taskIds } }, transaction });
  await Notification.destroy({ where: { referenceType: "task", referenceId: { [Op.in]: taskIds } }, transaction });
  await Task.destroy({ where: { id: { [Op.in]: taskIds } }, transaction });
};

// Removes a project's members + activity entries (its tasks must already be deleted).
const deleteProjectChildren = async (projectId, transaction) => {
  const project = await Project.findByPk(projectId, { attributes: ["id", "name"], transaction });
  if (project) {
    await TimesheetEntry.update({ projectId: null, deletedProjectName: project.name }, { where: { projectId }, transaction });
  }
  await ProjectMember.destroy({ where: { projectId }, transaction });
  await ActivityLog.destroy({ where: { entityType: "PROJECT", entityId: projectId }, transaction });
};

module.exports = { deleteTasksCascade, deleteProjectChildren };
