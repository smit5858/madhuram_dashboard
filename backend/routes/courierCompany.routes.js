const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const courierCompanyController = require("../controllers/courierCompany.controller");

// Read is available to anyone with access to the couriers module (they need the list to pick a
// company on a courier record); create/update/delete are Admin-only via the seeded permission
// defaults for this route (see server.js#ensureAllRoutesAndPermissions).
router.get("/", authenticate, authorize("/couriers-companies", "read"), courierCompanyController.getCourierCompanies);
router.post("/", authenticate, authorize("/couriers-companies", "create"), courierCompanyController.createCourierCompany);
router.put("/:id", authenticate, authorize("/couriers-companies", "update"), courierCompanyController.updateCourierCompany);
router.delete("/:id", authenticate, authorize("/couriers-companies", "delete"), courierCompanyController.deleteCourierCompany);

module.exports = router;
