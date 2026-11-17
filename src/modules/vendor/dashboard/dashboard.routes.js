const express = require("express");
const authenticateVendor = require("../../../middleware/vendorAuth.middleware");
const controller = require("./dashboard.controller");

const router = express.Router();
router.use(authenticateVendor());

router.get("/", controller.getDashboard);

module.exports = router;
