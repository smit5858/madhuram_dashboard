const { Route, UserPermission } = require("../models");
const { Op } = require("sequelize");

// Access is granted per-user only (Settings → Route Setting) — there is no role-based
// permission fallback. Absence of a UserPermission row for a route means no access.
module.exports = (routeNameOrPath, action) => {
  // Normalize action name to canRead, canCreate, canUpdate, canDelete
  const actionKey = `can${action.charAt(0).toUpperCase()}${action.slice(1)}`; // "read" -> "canRead"

  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user || !user.roleId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      // If user is Admin, bypass authorization check
      if (user.roleName === "Admin") {
        return next();
      }

      // Find route by name or path
      const route = await Route.findOne({
        where: {
          [Op.or]: [
            { name: routeNameOrPath },
            { path: routeNameOrPath },
          ],
        },
      });

      if (!route) {
        return res.status(403).json({ success: false, message: "Insufficient permissions for this route" });
      }

      const userPermission = await UserPermission.findOne({
        where: {
          userId: user.id,
          routeId: route.id,
        },
      });

      if (!userPermission || !userPermission[actionKey]) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
      }

      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};