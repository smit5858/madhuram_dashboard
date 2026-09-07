const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const platformController = require("../controllers/platform.controller");

const ROUTE_PATH = "/settings/platforms";

// GET is intentionally not gated by authorize() — any authenticated user (including a Sales
// Employee with no Platform Management access) needs to populate the Lead form's platform
// dropdown. See platform.controller.js#getPlatforms.
router.get("/", authenticate, platformController.getPlatforms);
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), platformController.createPlatform);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), platformController.updatePlatform);
router.delete("/:id", authenticate, authorize(ROUTE_PATH, "delete"), platformController.deletePlatform);

module.exports = router;
