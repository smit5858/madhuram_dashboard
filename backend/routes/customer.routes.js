const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const customerController = require("../controllers/customer.controller");

router.get("/", authenticate, authorize("/customers", "read"), customerController.getCustomers);
router.get("/phone/:phone", authenticate, authorize("/customers", "read"), customerController.getCustomerByPhone);
router.get("/:id", authenticate, authorize("/customers", "read"), customerController.getCustomerById);
router.post("/", authenticate, authorize("/customers", "create"), customerController.createCustomer);
router.put("/:id", authenticate, authorize("/customers", "update"), customerController.updateCustomer);
router.delete("/:id", authenticate, authorize("/customers", "delete"), customerController.deleteCustomer);

module.exports = router;
