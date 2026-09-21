const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const taskController = require("../controllers/task.controller");

const ROUTE_PATH = "/tasks";

router.get("/", authenticate, authorize(ROUTE_PATH, "read"), taskController.getTasks);
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), taskController.createTask);
router.get("/:id", authenticate, authorize(ROUTE_PATH, "read"), taskController.getTaskById);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), taskController.updateTask);
// Admin-only — enforced in the controller too (authorize alone would let any user granted canDelete through).
router.delete("/:id", authenticate, authorize(ROUTE_PATH, "delete"), taskController.deleteTask);
router.put("/:id/status", authenticate, authorize(ROUTE_PATH, "update"), taskController.updateTaskStatus);
router.put("/:id/assign", authenticate, authorize(ROUTE_PATH, "update"), taskController.reassignTask);
router.get("/:id/activity", authenticate, authorize(ROUTE_PATH, "read"), taskController.getTaskActivity);
router.get("/:id/notes", authenticate, authorize(ROUTE_PATH, "read"), taskController.getTaskNotes);
router.post("/:id/notes", authenticate, authorize(ROUTE_PATH, "update"), taskController.addTaskNote);
router.put("/:id/notes/:noteId", authenticate, authorize(ROUTE_PATH, "update"), taskController.updateTaskNote);
router.post("/:id/assignees", authenticate, authorize(ROUTE_PATH, "update"), taskController.addTaskAssignees);
router.delete("/:id/assignees/:userId", authenticate, authorize(ROUTE_PATH, "update"), taskController.removeTaskAssignee);

module.exports = router;
