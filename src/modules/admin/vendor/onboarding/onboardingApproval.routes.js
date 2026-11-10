const express = require("express");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");
const controller = require("./onboardingApproval.controller");

const router = express.Router();

router.get("/", verifyAdmin, controller.getAllOnboarding);
router.patch("/:vendorId/status", verifyAdmin, controller.setOnboardingStatus);

module.exports = router;
