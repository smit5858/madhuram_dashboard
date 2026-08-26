const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const userController = require("../controllers/user.controller");

router.get("/", authenticate, authorize("/users", "read"), userController.getUsers);
router.get("/roles", authenticate, authorize("/users", "read"), userController.getRoles);
router.get("/:id", authenticate, authorize("/users", "read"), userController.getUserById);
router.post("/", authenticate, authorize("/users", "create"), userController.createUser);
router.put("/:id", authenticate, authorize("/users", "update"), userController.updateUser);
router.delete("/:id", authenticate, authorize("/users", "delete"), userController.deleteUser);

module.exports = router;
