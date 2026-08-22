const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const notificationController = require("../controllers/notification.controller");

router.get("/", authenticate, notificationController.getNotifications);
// read-all must come BEFORE /:id to avoid route conflict
router.patch("/read-all", authenticate, notificationController.markAllRead);
router.patch("/:id/read", authenticate, notificationController.markRead);

module.exports = router;
