const { Permission, Route } = require("../models");
const { Op } = require("sequelize");

exports.getSidebarPermissions = async (req, res) => {
  try {
    const { roleId } = req.user;

    // Get all permissions for this role where canRead is true
    const permissions = await Permission.findAll({
      where: {
        roleId,
        canRead: true,
      },
      include: {
        model: Route,
      },
    });

    // Format the routes list
    const routes = permissions
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
    const requestedRoleId = req.query.roleId ? parseInt(req.query.roleId) : authenticatedUser.roleId;
    const routeId = req.query.routeId ? parseInt(req.query.routeId) : null;
    const routePath = req.query.path || null;

    // Validate that the user is allowed to check for this roleId
    if (requestedRoleId !== authenticatedUser.roleId && authenticatedUser.roleName !== "Admin") {
      return res.status(403).json({ success: false, message: "Forbidden: You cannot inspect another role's permissions." });
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
    if (authenticatedUser.roleName === "Admin" && requestedRoleId === authenticatedUser.roleId) {
      return res.status(200).json({
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    }

    // Find the Permission entry
    const permission = await Permission.findOne({
      where: {
        roleId: requestedRoleId,
        routeId: route.id,
      },
    });

    return res.status(200).json({
      canRead: permission ? permission.canRead : false,
      canCreate: permission ? permission.canCreate : false,
      canUpdate: permission ? permission.canUpdate : false,
      canDelete: permission ? permission.canDelete : false,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
