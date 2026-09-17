const { Route, UserPermission } = require("../models");
const { Op } = require("sequelize");

// Like authorize.js, but grants access if the user has ANY of the given actions on a single route
// path — used where one endpoint legitimately serves users who only have "create" as well as users
// who only have "update" on that route (see sells.routes.js's quick-add-product, reachable from
// both the new-sale form and the edit-sale form). Everywhere else, prefer the single-action
// authorize().
//
// Access is granted per-user only (Settings → Route Setting) — there is no role-based
// permission fallback. Absence of a UserPermission row for a route means no access.
module.exports = (routeNameOrPath, actions) => {
  const actionKeys = actions.map((action) => `can${action.charAt(0).toUpperCase()}${action.slice(1)}`);

  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user || !user.roleId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      if (user.roleName === "Admin") {
        return next();
      }

      const route = await Route.findOne({
        where: { [Op.or]: [{ name: routeNameOrPath }, { path: routeNameOrPath }] },
      });

      if (!route) {
        return res.status(403).json({ success: false, message: "Insufficient permissions for this route" });
      }

      const userPermission = await UserPermission.findOne({ where: { userId: user.id, routeId: route.id } });

      if (userPermission && actionKeys.some((key) => userPermission[key])) {
        return next();
      }

      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};
