const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const authenticate = require("../middlewares/authenticate");

router.post("/login", authController.login);
router.post("/refresh", authController.refreshToken);
router.post("/logout", authenticate, authController.logout);

module.exports = router;