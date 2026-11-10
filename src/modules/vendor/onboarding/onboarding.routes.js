const express = require("express");
const authenticateVendor = require("../../../middleware/vendorAuth.middleware");
const { uploadFiles } = require("../../../middleware/vendorOnboardingUpload.middleware");
const controller = require("./onboarding.controller");

const router = express.Router();
router.use(authenticateVendor());

router.get("/:type/files/:filename", controller.getOnboardingFile);
router.get("/:type", controller.getOnboarding);
router.put("/:type", uploadFiles, controller.saveDraft);
router.post("/:type/submit", uploadFiles, controller.submitOnboarding);

module.exports = router;
