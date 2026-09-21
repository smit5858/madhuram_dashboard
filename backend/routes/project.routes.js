const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const projectController = require("../controllers/project.controller");

const ROUTE_PATH = "/projects";

router.get("/", authenticate, authorize(ROUTE_PATH, "read"), projectController.getProjects);
router.post("/", authenticate, authorize(ROUTE_PATH, "create"), projectController.createProject);
router.get("/:id", authenticate, authorize(ROUTE_PATH, "read"), projectController.getProjectById);
router.put("/:id", authenticate, authorize(ROUTE_PATH, "update"), projectController.updateProject);
// Admin-only — enforced in the controller too (authorize alone would let any user granted canDelete through).
router.delete("/:id", authenticate, authorize(ROUTE_PATH, "delete"), projectController.deleteProject);
router.post("/:id/members", authenticate, authorize(ROUTE_PATH, "update"), projectController.addProjectMembers);
router.delete("/:id/members/:memberId", authenticate, authorize(ROUTE_PATH, "update"), projectController.removeProjectMember);

module.exports = router;
