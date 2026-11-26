const express = require("express");
const authenticateVendor = require("../../../middleware/vendorAuth.middleware");
const { uploadFiles } = require("../../../middleware/vendorOnboardingUpload.middleware");
const controller = require("./onboarding.controller");

const router = express.Router();
router.use(authenticateVendor());

// File download
router.get("/:type/files/:filename", controller.getOnboardingFile);

// Role-specific and unified submission/registration endpoints
router.post("/:type/submit", uploadFiles, controller.submitOnboarding);
router.post("/:type/register", uploadFiles, controller.submitOnboarding);
router.post("/submit", uploadFiles, controller.submitOnboarding);
router.post("/register", uploadFiles, controller.submitOnboarding);

// Role-specific and unified draft saving endpoints
router.put("/:type", uploadFiles, controller.saveDraft);
router.put("/draft", uploadFiles, controller.saveDraft);
router.put("/", uploadFiles, controller.saveDraft);

// Get onboarding status/details
router.get("/:type", controller.getOnboarding);
router.get("/", controller.getOnboarding);

module.exports = router;
