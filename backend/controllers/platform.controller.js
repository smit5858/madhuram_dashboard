const { Platform, Lead } = require("../models");

// GET /platforms?status=active — the Lead form calls this with status=active to populate its
// dropdown. Deliberately reachable by any authenticated user (see platform.routes.js) so a
// Sales Employee can pick a platform without needing the Settings → Platform Management
// permission, same idea as customer.controller.js's GET /customers/phone/:phone.
exports.getPlatforms = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status === "active") where.isActive = true;
    else if (status === "inactive") where.isActive = false;

    const platforms = await Platform.findAll({ where, order: [["name", "ASC"]] });
    return res.status(200).json({ success: true, data: platforms });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /platforms
exports.createPlatform = async (req, res) => {
  try {
    const { name, isActive } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const platform = await Platform.create({
      name: name.trim(),
      isActive: isActive !== undefined ? !!isActive : true,
    });

    return res.status(201).json({ success: true, message: "Platform created successfully", data: platform });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A platform with this name already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /platforms/:id
exports.updatePlatform = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body || {};

    const platform = await Platform.findByPk(id);
    if (!platform) {
      return res.status(404).json({ success: false, message: "Platform not found" });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      platform.name = name.trim();
    }
    if (isActive !== undefined) platform.isActive = !!isActive;

    await platform.save();

    return res.status(200).json({ success: true, message: "Platform updated successfully", data: platform });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A platform with this name already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /platforms/:id — blocked while any Lead still references this platform, so historical
// leads never end up pointing at a deleted row (deactivate instead, via updatePlatform).
exports.deletePlatform = async (req, res) => {
  try {
    const { id } = req.params;
    const platform = await Platform.findByPk(id);
    if (!platform) {
      return res.status(404).json({ success: false, message: "Platform not found" });
    }

    const leadCount = await Lead.count({ where: { platformId: id } });
    if (leadCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete this platform — it is used by ${leadCount} lead${leadCount === 1 ? "" : "s"}. Deactivate it instead.`,
      });
    }

    await platform.destroy();

    return res.status(200).json({ success: true, message: "Platform deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
