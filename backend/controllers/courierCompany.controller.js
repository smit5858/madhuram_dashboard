const { CourierCompany } = require("../models");
const { Op } = require("sequelize");

// GET /couriers-companies?search=&page=&limit= — page/limit are optional; when omitted the
// full (unpaginated) list is returned exactly as before, so the dropdown pickers and
// tracking-link lookups scattered across the Courier module (which never send them) are
// unaffected. Passing either one switches to a paginated response with meta.
exports.getCourierCompanies = async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search && search.trim()) {
      where.name = { [Op.like]: `%${search.trim()}%` };
    }

    if (req.query.page !== undefined || req.query.limit !== undefined) {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

      const { rows, count } = await CourierCompany.findAndCountAll({
        where,
        order: [["name", "ASC"]],
        limit,
        offset: (page - 1) * limit,
      });

      return res.status(200).json({
        success: true,
        data: rows,
        meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 1 },
      });
    }

    const companies = await CourierCompany.findAll({ where, order: [["name", "ASC"]] });
    return res.status(200).json({ success: true, data: companies });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /couriers-companies — Admin only (enforced by route-level permission)
exports.createCourierCompany = async (req, res) => {
  try {
    const { name, trackingLinkTemplate, isActive } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const company = await CourierCompany.create({
      name: name.trim(),
      trackingLinkTemplate: trackingLinkTemplate ? trackingLinkTemplate.trim() : null,
      isActive: isActive !== undefined ? !!isActive : true,
    });

    return res.status(201).json({ success: true, message: "Courier company created successfully", data: company });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A courier company with this name already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /couriers-companies/:id — Admin only (enforced by route-level permission)
exports.updateCourierCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, trackingLinkTemplate, isActive } = req.body || {};

    const company = await CourierCompany.findByPk(id);
    if (!company) {
      return res.status(404).json({ success: false, message: "Courier company not found" });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      company.name = name.trim();
    }
    if (trackingLinkTemplate !== undefined) company.trackingLinkTemplate = trackingLinkTemplate ? trackingLinkTemplate.trim() : null;
    if (isActive !== undefined) company.isActive = !!isActive;

    await company.save();

    return res.status(200).json({ success: true, message: "Courier company updated successfully", data: company });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A courier company with this name already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /couriers-companies/:id — Admin only (enforced by route-level permission)
exports.deleteCourierCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await CourierCompany.findByPk(id);
    if (!company) {
      return res.status(404).json({ success: false, message: "Courier company not found" });
    }

    await company.destroy();

    return res.status(200).json({ success: true, message: "Courier company deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
