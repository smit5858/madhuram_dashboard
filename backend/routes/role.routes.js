const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { canViewAllRecords } = require("../helper/permissionScope");
const roleController = require("../controllers/role.controller");

// "Assign Role to User" reuses the Role Management route's viewAllRecords column as its
// permission bit (Admin bypass, then a per-user grant via Settings → Route Setting) — see
// PermissionGrid.tsx's fifthColumnHint for why that column, and role.controller.js for what the
// action actually does (set User.roleId, nothing else).
const authorizeAssignRole = async (req, res, next) => {
  try {
    if (req.user?.roleName === "Admin") return next();
    const allowed = await canViewAllRecords(req.user, "/setting/role-management");
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Insufficient permissions" });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.get("/", authenticate, authorize("/setting/role-management", "read"), roleController.getRoles);
router.post("/", authenticate, authorize("/setting/role-management", "create"), roleController.createRole);
router.put("/assign/:userId", authenticate, authorizeAssignRole, roleController.assignRoleToUser);
router.put("/:id", authenticate, authorize("/setting/role-management", "update"), roleController.updateRole);
router.delete("/:id", authenticate, authorize("/setting/role-management", "delete"), roleController.deleteRole);

module.exports = router;
