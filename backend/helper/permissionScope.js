const { Route, UserPermission } = require("../models");

// Whether this (JWT) user should see ALL records on the module at routePath, rather than
// only ones they created — driven by the user's own UserPermission row (Settings → Route
// Setting); there is no role-based fallback. Admin always sees everything, same as
// everywhere else in the app.
const canViewAllRecords = async (jwtUser, routePath) => {
  if (!jwtUser) return false;
  if (jwtUser.roleName === "Admin") return true;

  const route = await Route.findOne({ where: { path: routePath } });
  if (!route) return false;

  const userPermission = await UserPermission.findOne({
    where: { userId: jwtUser.id, routeId: route.id },
  });
  return !!(userPermission && userPermission.viewAllRecords);
};

module.exports = { canViewAllRecords };
