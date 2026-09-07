const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const routeSettingController = require("../controllers/routeSetting.controller");

router.get(
  "/:userId/permissions",
  authenticate,
  authorize("/setting/route-setting", "read"),
  routeSettingController.getUserPermissions
);
router.put(
  "/:userId/permissions",
  authenticate,
  authorize("/setting/route-setting", "update"),
  routeSettingController.updateUserPermissions
);

module.exports = router;
