const { Route, Permission } = require("../models");
const { Op } = require("sequelize");

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

      // Look up permissions for user role and route
      const permission = await Permission.findOne({
        where: {
          roleId: user.roleId,
          routeId: route.id,
        },
      });

      if (!permission || !permission[actionKey]) {
        return res.status(403).json({ success: false, message: "Insufficient permissions" });
      }

      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};