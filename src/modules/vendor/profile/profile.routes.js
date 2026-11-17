const express = require("express");
const authenticateVendor = require("../../../middleware/vendorAuth.middleware");
const controller = require("./profile.controller");

const router = express.Router();
router.use(authenticateVendor());

router.get("/", controller.getProfile);
router.patch("/", controller.updateProfile);
router.delete("/", controller.deleteProfile);

module.exports = router;
