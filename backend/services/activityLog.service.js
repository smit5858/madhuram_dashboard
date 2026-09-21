const { ActivityLog } = require("../models");

// Single write path for every Task/Project audit entry — always called inside the same
// transaction as the change it's recording (see task.controller.js/project.controller.js), so
// the activity feed can never drift from what actually happened. Mirrors notification.service.js's
// single-entrypoint shape.
const logActivity = async ({ entityType, entityId, action, actorId, subjectUserId, oldValue, newValue, note }, transaction) => {
  return ActivityLog.create(
    {
      entityType,
      entityId,
      action,
      actorId,
      subjectUserId: subjectUserId || null,
      oldValue: oldValue === undefined || oldValue === null ? null : String(oldValue),
      newValue: newValue === undefined || newValue === null ? null : String(newValue),
      note: note || null,
    },
    transaction ? { transaction } : undefined
  );
};

module.exports = { logActivity };
