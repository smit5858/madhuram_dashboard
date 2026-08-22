const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const permissionController = require("../controllers/permission.controller");

router.get("/sidebar", authenticate, permissionController.getSidebarPermissions);
router.get("/", authenticate, permissionController.getPagePermissions);

module.exports = router;
