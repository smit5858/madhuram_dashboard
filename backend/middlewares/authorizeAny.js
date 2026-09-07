const { Route, UserPermission } = require("../models");

// Like authorize.js, but grants access if the user has "read" on ANY of the given route paths —
// used only for the two ledger GET routes that legitimately serve two different audiences (Sells
// reps sharing a customer's statement via /sells, and Account/Admin browsing it via
// /account/debited). Everywhere else, prefer the single-path authorize().
//
// Access is granted per-user only (Settings → Route Setting) — there is no role-based
// permission fallback. Absence of a UserPermission row for a route means no access.
module.exports = (routePaths) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user || !user.roleId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      if (user.roleName === "Admin") {
        return next();
      }

      for (const path of routePaths) {
        const route = await Route.findOne({ where: { path } });
        if (!route) continue;

        const userPermission = await UserPermission.findOne({ where: { userId: user.id, routeId: route.id } });
        if (userPermission && userPermission.canRead) return next();
      }

      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };
};
