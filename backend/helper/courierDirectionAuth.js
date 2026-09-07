const { Route, UserPermission } = require("../models");

// Outgoing and Incoming Courier are independently permissioned routes even though they share
// one Express router (differentiated only by Courier.direction) — see server.js's
// SYSTEM_ROUTES/backfillIncomingCourierPermissions for how the two Route rows were split from
// the original single "/couriers" permission.
const ROUTE_PATH_FOR_DIRECTION = { OUT: "/couriers", IN: "/couriers/incoming" };

const hasDirectionPermission = async (jwtUser, direction, action) => {
  if (!jwtUser) return false;
  if (jwtUser.roleName === "Admin") return true;

  const routePath = ROUTE_PATH_FOR_DIRECTION[direction] || ROUTE_PATH_FOR_DIRECTION.OUT;
  const route = await Route.findOne({ where: { path: routePath } });
  if (!route) return false;

  const actionKey = `can${action.charAt(0).toUpperCase()}${action.slice(1)}`;
  const userPermission = await UserPermission.findOne({
    where: { userId: jwtUser.id, routeId: route.id },
  });
  return !!(userPermission && userPermission[actionKey]);
};

// Express middleware for the list/export GETs — direction comes from the query string, defaults
// to "OUT" (matching exportCouriers' existing default), since every real UI caller always sends
// an explicit direction.
const requireCourierListAccess = (action) => async (req, res, next) => {
  try {
    const direction = req.query.direction === "IN" ? "IN" : "OUT";
    const allowed = await hasDirectionPermission(req.user, direction, action);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Inline helper for :id-scoped controller actions, called after the record has been fetched
// (its direction isn't known until then) — same call/return style as verifyScope in
// courier.controller.js. Returns true if allowed; writes the 403 response itself and returns
// false otherwise, so callers can just `if (!(await requireCourierRecordAccess(...))) return;`.
const requireCourierRecordAccess = async (req, res, courier, action) => {
  const allowed = await hasDirectionPermission(req.user, courier.direction, action);
  if (!allowed) {
    res.status(403).json({ success: false, message: "Insufficient permissions" });
  }
  return allowed;
};

module.exports = { hasDirectionPermission, requireCourierListAccess, requireCourierRecordAccess };
