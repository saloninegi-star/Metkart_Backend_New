const express = require("express");
const router = express.Router();
const businessTypeController = require("./businessType.controller");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");
const upload = require("../../../../middleware/upload.middleware");

// READ ALL (No token required - available for vendor and public)
router.get("/", businessTypeController.getAllBusinessTypes);

// READ SINGLE (No token required - available for vendor and public)
router.get("/:id", businessTypeController.getBusinessTypeById);

// CREATE (File upload ke sath - Admin token required)
router.post(
  "/",
  verifyAdmin,
  upload.single("icon"),
  businessTypeController.createBusinessType
);

// UPDATE (Admin token required)
router.put(
  "/:id",
  verifyAdmin,
  upload.single("icon"),
  businessTypeController.updateBusinessType
);

// DELETE (Admin token required)
router.delete("/:id", verifyAdmin, businessTypeController.deleteBusinessType);

module.exports = router;
