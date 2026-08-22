const { Courier, User } = require("../models");

exports.getCouriers = async (req, res) => {
  try {
    const user = req.user;
    let whereCondition = {};

    // Filter by ownership if not Admin
    if (user.roleName !== "Admin") {
      whereCondition.userId = user.id;
    }

    const couriers = await Courier.findAll({
      where: whereCondition,
      include: {
        model: User,
        attributes: ["id", "name", "email"],
      },
    });

    return res.status(200).json({
      success: true,
      data: couriers,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCourierById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id, {
      include: {
        model: User,
        attributes: ["id", "name", "email"],
      },
    });

    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Access control: only owner or Admin can access
    if (user.roleName !== "Admin" && courier.userId !== user.id) {
      return res.status(403).json({ success: false, message: "Access denied: You do not own this record" });
    }

    return res.status(200).json({
      success: true,
      data: courier,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.createCourier = async (req, res) => {
  try {
    const user = req.user;
    const { name, email, phone } = req.body || {};

    if (!name) {
      return res.status(400).json({ success: false, message: "Courier name is required" });
    }

    // Non-admin always owns their courier; Admin can assign to another user if userId is provided in body
    let targetUserId = user.id;
    if (user.roleName === "Admin" && req.body.userId) {
      targetUserId = parseInt(req.body.userId);
    }

    const courier = await Courier.create({
      name,
      email,
      phone,
      userId: targetUserId,
    });

    return res.status(201).json({
      success: true,
      message: "Courier created successfully",
      data: courier,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateCourier = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { name, email, phone } = req.body || {};

    const courier = await Courier.findByPk(id);
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Access control: only owner or Admin can update
    if (user.roleName !== "Admin" && courier.userId !== user.id) {
      return res.status(403).json({ success: false, message: "Access denied: You do not own this record" });
    }

    if (name) courier.name = name;
    if (email !== undefined) courier.email = email;
    if (phone !== undefined) courier.phone = phone;

    // Admin can reassign ownership
    if (user.roleName === "Admin" && req.body.userId) {
      courier.userId = parseInt(req.body.userId);
    }

    await courier.save();

    return res.status(200).json({
      success: true,
      message: "Courier updated successfully",
      data: courier,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteCourier = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id);
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Access control: only owner or Admin can delete
    if (user.roleName !== "Admin" && courier.userId !== user.id) {
      return res.status(403).json({ success: false, message: "Access denied: You do not own this record" });
    }

    await courier.destroy();

    return res.status(200).json({
      success: true,
      message: "Courier deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
