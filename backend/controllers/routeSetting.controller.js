const sequelize = require("../config/db");
const { User, Role, Route, UserPermission } = require("../models");

// GET /route-settings/:userId/permissions
// Returns every route with this user's own permission (Settings → Route Setting). Access is
// granted per-user only — there is no role-based permission to fall back to.
exports.getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, { include: [{ model: Role, attributes: ["id", "name"] }] });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const allRoutes = await Route.findAll({ order: [["id", "ASC"]] });

    const userPermissionRows = await UserPermission.findAll({ where: { userId: user.id } });
    const userPermMap = {};
    for (const up of userPermissionRows) {
      userPermMap[up.routeId] = up;
    }

    const isAdmin = user.Role && user.Role.name === "Admin";

    const permissions = allRoutes.map((route) => {
      const override = userPermMap[route.id];

      if (isAdmin) {
        return {
          routeId: route.id,
          routeName: route.name,
          routePath: route.path,
          module: route.module || null,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          viewAllRecords: true,
          isOverride: false,
        };
      }

      return {
        routeId: route.id,
        routeName: route.name,
        routePath: route.path,
        module: route.module || null,
        canRead: override ? override.canRead : false,
        canCreate: override ? override.canCreate : false,
        canUpdate: override ? override.canUpdate : false,
        canDelete: override ? override.canDelete : false,
        viewAllRecords: override ? override.viewAllRecords : false,
        isOverride: Boolean(override),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, roleId: user.roleId, roleName: user.Role?.name },
        permissions,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /route-settings/:userId/permissions
// body: { permissions: [{ routeId, canRead, canCreate, canUpdate, canDelete }, ...] }
exports.updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body || {};

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ success: false, message: "permissions must be a non-empty array" });
    }

    const routeIds = permissions.map((p) => p.routeId);
    const validRoutes = await Route.findAll({ where: { id: routeIds } });
    const validRouteIds = new Set(validRoutes.map((r) => r.id));

    for (const entry of permissions) {
      if (!validRouteIds.has(entry.routeId)) {
        return res.status(400).json({ success: false, message: `Invalid routeId: ${entry.routeId}` });
      }
    }

    const result = await sequelize.transaction(async (t) => {
      const saved = [];
      for (const entry of permissions) {
        const values = {
          canRead: Boolean(entry.canRead),
          canCreate: Boolean(entry.canCreate),
          canUpdate: Boolean(entry.canUpdate),
          canDelete: Boolean(entry.canDelete),
          viewAllRecords: Boolean(entry.viewAllRecords),
        };

        const [row, created] = await UserPermission.findOrCreate({
          where: { userId: user.id, routeId: entry.routeId },
          defaults: values,
          transaction: t,
        });

        if (!created) {
          await row.update(values, { transaction: t });
        }

        saved.push(row);
      }
      return saved;
    });

    return res.status(200).json({
      success: true,
      message: "Permissions updated successfully",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
