const { Notification, Route, UserPermission } = require("../models");
const { Op } = require("sequelize");

// Route.module ("Courier", "Account") / bare route path ("/leads") -> the recipientModule string
// notify() actually broadcasts to for that area. Only routes with a real notification channel are
// mapped here; everything else (Setting, Dashboard, Customers, Products, Users, Sells) has none.
const MODULE_BY_ROUTE_MODULE = { Courier: "couriers", Account: "account" };
const MODULE_BY_ROUTE_PATH = { "/leads": "leads" };

// Which broadcast modules this user is allowed to see, based on their own granted route
// permissions — never trust a client-supplied module filter beyond this set, same principle as
// expense.controller.js's canViewAllRecords. null = unrestricted (Admin sees every broadcast,
// same as the Admin bypass in authorize.js); "all" is always included since it's the reserved
// module for a broadcast meant for literally everyone.
const getAllowedBroadcastModules = async (user) => {
  if (user.roleName === "Admin") return null;

  const perms = await UserPermission.findAll({
    where: { userId: user.id, canRead: true },
    include: [{ model: Route, attributes: ["path", "module"] }],
  });

  const modules = new Set(["all"]);
  for (const perm of perms) {
    const route = perm.Route;
    if (!route) continue;
    if (MODULE_BY_ROUTE_MODULE[route.module]) modules.add(MODULE_BY_ROUTE_MODULE[route.module]);
    if (MODULE_BY_ROUTE_PATH[route.path]) modules.add(MODULE_BY_ROUTE_PATH[route.path]);
  }
  return Array.from(modules);
};

// Broadcast (module-wide) notifications are those with no recipientUserId; a personal
// notification (recipientUserId set) is only ever visible to that one user. `allowedModules`
// (from getAllowedBroadcastModules; null for Admin) is the real boundary — an explicit `mod`
// query filter can only narrow it further, never widen it.
const buildVisibilityWhere = (userId, mod, allowedModules) => {
  let modules = allowedModules;
  if (mod) {
    const requested = new Set([mod, "all"]);
    modules = allowedModules ? allowedModules.filter((m) => requested.has(m)) : Array.from(requested);
  }

  const broadcastWhere =
    modules === null ? { recipientUserId: null } : { recipientModule: { [Op.in]: modules }, recipientUserId: null };

  return { [Op.or]: [broadcastWhere, { recipientUserId: userId }] };
};

// GET /notifications?module=couriers|account|all
exports.getNotifications = async (req, res) => {
  try {
    const { module: mod, limit = 50 } = req.query;
    const allowedModules = await getAllowedBroadcastModules(req.user);
    const where = buildVisibilityWhere(req.user.id, mod, allowedModules);

    const notifications = await Notification.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
    });

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notif = await Notification.findByPk(id);
    if (!notif) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    notif.isRead = true;
    await notif.save();

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /notifications/read-all?module=couriers|account
exports.markAllRead = async (req, res) => {
  try {
    const { module: mod } = req.query;
    const allowedModules = await getAllowedBroadcastModules(req.user);
    const where = { isRead: false, ...buildVisibilityWhere(req.user.id, mod, allowedModules) };

    await Notification.update({ isRead: true }, { where });

    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
