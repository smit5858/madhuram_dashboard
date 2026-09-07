const { Role, User } = require("../models");

// GET /roles — list every role with how many users currently hold it (used by the Role
// Management table; unlike GET /users/roles this isn't a lightweight dropdown lookup).
exports.getRoles = async (req, res) => {
  try {
    const roleRows = await Role.findAll({ order: [["id", "ASC"]] });
    const roles = await Promise.all(
      roleRows.map(async (role) => ({
        ...role.toJSON(),
        userCount: await User.count({ where: { roleId: role.id } }),
      }))
    );
    return res.status(200).json({ success: true, data: roles });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /roles
exports.createRole = async (req, res) => {
  try {
    const { name, isActive } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const role = await Role.create({
      name: name.trim(),
      isActive: isActive !== undefined ? !!isActive : true,
    });

    return res.status(201).json({ success: true, message: "Role created successfully", data: role });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A role with this name already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /roles/:id
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body || {};

    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: "name cannot be empty" });
      }
      role.name = name.trim();
    }
    if (isActive !== undefined) role.isActive = !!isActive;

    await role.save();

    return res.status(200).json({ success: true, message: "Role updated successfully", data: role });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A role with this name already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /roles/:id — blocked while any user still holds this role, so a delete can never
// silently strand users without a role.
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ success: false, message: "Role not found" });
    }

    const userCount = await User.count({ where: { roleId: id } });
    if (userCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete this role — it is currently assigned to ${userCount} user${userCount === 1 ? "" : "s"}. Reassign them first.`,
      });
    }

    await role.destroy();

    return res.status(200).json({ success: true, message: "Role deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /roles/assign/:userId — Role Management's one user-facing capability beyond role CRUD:
// assign an existing role to an existing user. Deliberately does not touch UserPermission rows;
// permission configuration stays exclusively in Settings → Route Setting.
exports.assignRoleToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { roleId } = req.body || {};

    if (!roleId) {
      return res.status(400).json({ success: false, message: "roleId is required" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(400).json({ success: false, message: "Selected role does not exist" });
    }
    if (!role.isActive) {
      return res.status(400).json({ success: false, message: "Selected role is inactive and cannot be assigned" });
    }

    user.roleId = roleId;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `${user.name} is now assigned the ${role.name} role`,
      data: { id: user.id, name: user.name, email: user.email, Role: { id: role.id, name: role.name } },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
