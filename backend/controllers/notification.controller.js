const { Notification } = require("../models");
const { Op } = require("sequelize");

// GET /notifications?module=couriers|account|all
exports.getNotifications = async (req, res) => {
  try {
    const { module: mod, limit = 50 } = req.query;

    const where = {};
    if (mod) {
      where.recipientModule = { [Op.in]: [mod, "all"] };
    }

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

    const where = { isRead: false };
    if (mod) {
      where.recipientModule = { [Op.in]: [mod, "all"] };
    }

    await Notification.update({ isRead: true }, { where });

    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
