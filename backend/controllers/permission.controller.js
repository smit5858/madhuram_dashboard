const { Route, UserPermission } = require("../models");
const { Op } = require("sequelize");

// GET /permissions/all
// Called ONCE after login — returns full permission set for the logged-in user. Access is
// granted per-user only (Settings → Route Setting); there is no role-based permission
// fallback, so a missing UserPermission row means no access to that route.
exports.getAllPermissions = async (req, res) => {
  try {
    const { id: userId, roleName } = req.user;

    // Fetch all routes
    const allRoutes = await Route.findAll();

    // Admin gets full access on every route automatically
    if (roleName === "Admin") {
      const permissions = allRoutes.map((r) => ({
        routeId: r.id,
        routeName: r.name,
        routePath: r.path,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        viewAllRecords: true,
      }));
      return res.status(200).json({ success: true, permissions });
    }

    const userPermissionRows = await UserPermission.findAll({ where: { userId } });
    const userPermMap = {};
    for (const up of userPermissionRows) {
      userPermMap[up.routeId] = up;
    }

    // Emit an entry for every known route (missing = all false)
    const permissions = allRoutes.map((r) => {
      const p = userPermMap[r.id];
      return {
        routeId: r.id,
        routeName: r.name,
        routePath: r.path,
        canRead: p ? p.canRead : false,
        canCreate: p ? p.canCreate : false,
        canUpdate: p ? p.canUpdate : false,
        canDelete: p ? p.canDelete : false,
        viewAllRecords: p ? p.viewAllRecords : false,
      };
    });

    return res.status(200).json({ success: true, permissions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSidebarPermissions = async (req, res) => {
  try {
    const { id: userId, roleName } = req.user;

    if (roleName === "Admin") {
      const allRoutes = await Route.findAll();
      return res.status(200).json({
        success: true,
        routes: allRoutes.map((r) => ({ id: r.id, name: r.name, path: r.path })),
      });
    }

    // Get every route this user has read access to
    const userPermissionRows = await UserPermission.findAll({
      where: { userId, canRead: true },
      include: { model: Route },
    });

    const routes = userPermissionRows
      .map((p) => p.Route)
      .filter(Boolean)
      .map((r) => ({
        id: r.id,
        name: r.name,
        path: r.path,
      }));

    return res.status(200).json({
      success: true,
      routes,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPagePermissions = async (req, res) => {
  try {
    const authenticatedUser = req.user;
    const requestedUserId = req.query.userId ? parseInt(req.query.userId) : authenticatedUser.id;
    const routeId = req.query.routeId ? parseInt(req.query.routeId) : null;
    const routePath = req.query.path || null;

    // Validate that the user is allowed to check for this userId
    if (requestedUserId !== authenticatedUser.id && authenticatedUser.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: You cannot inspect another user's permissions." });
    }

    // Find the Route
    let route;
    if (routeId) {
      route = await Route.findByPk(routeId);
    } else if (routePath) {
      route = await Route.findOne({
        where: {
          [Op.or]: [
            { path: routePath },
            { name: routePath },
          ],
        },
      });
    }

    if (!route) {
      // If route doesn't exist, return all false permissions
      return res.status(200).json({
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      });
    }

    // Admin has full permissions automatically
    if (authenticatedUser.roleName === "Admin" && requestedUserId === authenticatedUser.id) {
      return res.status(200).json({
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    }

    const userPermission = await UserPermission.findOne({
      where: {
        userId: requestedUserId,
        routeId: route.id,
      },
    });

    return res.status(200).json({
      canRead: userPermission ? userPermission.canRead : false,
      canCreate: userPermission ? userPermission.canCreate : false,
      canUpdate: userPermission ? userPermission.canUpdate : false,
      canDelete: userPermission ? userPermission.canDelete : false,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
