const { Dealer } = require("../models");
const { Op } = require("sequelize");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_REGEX = /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;

/** Normalizes a bare domain ("example.com") into a full URL; leaves already-schemed URLs alone. */
const normalizeWebsite = (website) => (/^https?:\/\//i.test(website) ? website : `https://${website}`);

// GET /dealers?search=&status=&page=&limit=
exports.getDealers = async (req, res) => {
  try {
    const { search, status, page, limit } = req.query;

    const where = {};
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      where[Op.or] = [{ name: { [Op.like]: s } }, { phone: { [Op.like]: s } }];
    }
    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Dealer.findAndCountAll({
      where,
      order: [["name", "ASC"]],
      limit: limitNum,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /dealers/:id
exports.getDealerById = async (req, res) => {
  try {
    const dealer = await Dealer.findByPk(req.params.id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: "Dealer not found" });
    }
    return res.status(200).json({ success: true, data: dealer });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /dealers
exports.createDealer = async (req, res) => {
  try {
    const user = req.user;
    const { name, phone, email, website, address } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Dealer name is required" });
    }
    if (email && email.trim() && !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ success: false, message: "Please enter a valid email" });
    }
    if (website && website.trim() && !WEBSITE_REGEX.test(website.trim())) {
      return res.status(400).json({ success: false, message: "Please enter a valid website URL" });
    }

    const dealer = await Dealer.create({
      name: name.trim(),
      phone: phone || null,
      email: email && email.trim() ? email.trim().toLowerCase() : null,
      website: website && website.trim() ? normalizeWebsite(website.trim()) : null,
      address: address || null,
      createdBy: user.id,
    });

    return res.status(201).json({ success: true, message: "Dealer created successfully", data: dealer });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /dealers/:id
exports.updateDealer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, website, address, isActive } = req.body || {};

    const dealer = await Dealer.findByPk(id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: "Dealer not found" });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: "Dealer name cannot be empty" });
      }
      dealer.name = name.trim();
    }
    if (email !== undefined) {
      if (email && email.trim() && !EMAIL_REGEX.test(email.trim())) {
        return res.status(400).json({ success: false, message: "Please enter a valid email" });
      }
      dealer.email = email && email.trim() ? email.trim().toLowerCase() : null;
    }
    if (website !== undefined) {
      if (website && website.trim() && !WEBSITE_REGEX.test(website.trim())) {
        return res.status(400).json({ success: false, message: "Please enter a valid website URL" });
      }
      dealer.website = website && website.trim() ? normalizeWebsite(website.trim()) : null;
    }
    if (phone !== undefined) dealer.phone = phone;
    if (address !== undefined) dealer.address = address;
    if (isActive !== undefined) dealer.isActive = isActive;

    await dealer.save();

    return res.status(200).json({ success: true, message: "Dealer updated successfully", data: dealer });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /dealers/:id — soft deactivate, preserves references from stock/serial history
exports.deleteDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findByPk(req.params.id);
    if (!dealer) {
      return res.status(404).json({ success: false, message: "Dealer not found" });
    }
    dealer.isActive = false;
    await dealer.save();
    return res.status(200).json({ success: true, message: "Dealer deactivated successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
