const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const permissionController = require("../controllers/permission.controller");

// Called once after login to load the full permission set
router.get("/all", authenticate, permissionController.getAllPermissions);

// Legacy endpoints kept for backward compatibility
router.get("/sidebar", authenticate, permissionController.getSidebarPermissions);
router.get("/", authenticate, permissionController.getPagePermissions);

module.exports = router;
