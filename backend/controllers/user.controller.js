const { User, Role } = require("../models");
const { Op } = require("sequelize");
const { hashPassword } = require("../helper/common");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_ATTRIBUTES = { exclude: ["password", "refreshToken", "tokenInvalidatedAt"] };

// GET /users
exports.getUsers = async (req, res) => {
  try {
    const { search, name, email, role, status, page, limit } = req.query;

    const where = {};
    const roleWhere = {};

    if (name) {
      where.name = { [Op.like]: `%${name.trim()}%` };
    }
    if (email) {
      where.email = { [Op.like]: `%${email.trim()}%` };
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      where[Op.or] = [{ name: { [Op.like]: s } }, { email: { [Op.like]: s } }];
    }

    if (role) {
      const roleId = parseInt(role, 10);
      if (!Number.isNaN(roleId) && String(roleId) === String(role).trim()) {
        where.roleId = roleId;
      } else {
        roleWhere.name = role;
      }
    }

    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    // Pagination — always coerce to safe, bounded integers
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: SAFE_ATTRIBUTES,
      include: [
        {
          model: Role,
          attributes: ["id", "name"],
          where: Object.keys(roleWhere).length ? roleWhere : undefined,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset,
      distinct: true,
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

// GET /users/roles
// Lightweight lookup used to populate role dropdowns (filters + create/edit form)
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ attributes: ["id", "name"], order: [["id", "ASC"]] });
    return res.status(200).json({ success: true, data: roles });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /users/:id
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: SAFE_ATTRIBUTES,
      include: [{ model: Role, attributes: ["id", "name"] }],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /users
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, allowedCity, isActive } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (!email || !email.trim() || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ success: false, message: "A valid email is required" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    if (!roleId) {
      return res.status(400).json({ success: false, message: "Role is required" });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(400).json({ success: false, message: "Selected role does not exist" });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ where: { email: trimmedEmail } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A user already exists with email ${trimmedEmail}`,
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: trimmedEmail,
      password: hashPassword(password),
      roleId,
      allowedCity: allowedCity ? allowedCity.trim() : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const sanitized = user.toJSON();
    delete sanitized.password;
    delete sanitized.refreshToken;
    delete sanitized.tokenInvalidatedAt;

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: { ...sanitized, Role: { id: role.id, name: role.name } },
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A user with this email already exists" });
    }
    if (err.name === "SequelizeValidationError") {
      return res.status(400).json({ success: false, message: err.errors?.[0]?.message || "Invalid user data" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /users/:id
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, roleId, allowedCity, isActive } = req.body || {};

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (email !== undefined) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        return res.status(400).json({ success: false, message: "A valid email is required" });
      }
      if (trimmedEmail !== user.email) {
        const existing = await User.findOne({
          where: { email: trimmedEmail, id: { [Op.ne]: id } },
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: `Another user already exists with email ${trimmedEmail}`,
          });
        }
      }
      user.email = trimmedEmail;
    }

    if (roleId !== undefined) {
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(400).json({ success: false, message: "Selected role does not exist" });
      }
      user.roleId = roleId;
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: "Name cannot be empty" });
      }
      user.name = name.trim();
    }

    if (allowedCity !== undefined) user.allowedCity = allowedCity ? allowedCity.trim() : null;
    if (isActive !== undefined) user.isActive = Boolean(isActive);

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
      }
      user.password = hashPassword(password);
      // Changing the password invalidates existing sessions for this user
      user.tokenInvalidatedAt = new Date();
      user.refreshToken = null;
    }

    await user.save();

    const refreshed = await User.findByPk(id, {
      attributes: SAFE_ATTRIBUTES,
      include: [{ model: Role, attributes: ["id", "name"] }],
    });

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: refreshed,
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }
    if (err.name === "SequelizeValidationError") {
      return res.status(400).json({ success: false, message: err.errors?.[0]?.message || "Invalid user data" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /users/:id
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const requester = req.user;

    if (requester && parseInt(id, 10) === requester.id) {
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Soft delete: deactivate + revoke sessions, preserving audit trail (matches customer/product pattern)
    user.isActive = false;
    user.tokenInvalidatedAt = new Date();
    user.refreshToken = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "User deactivated successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
