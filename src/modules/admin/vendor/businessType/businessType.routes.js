const express = require("express");
const router = express.Router();
const businessTypeController = require("./businessType.controller");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");

const upload = require("../../../../middleware/upload.middleware");

router.use(verifyAdmin);

// CREATE (File upload ke sath)
router.post(
  "/",
  upload.single("icon"),
  businessTypeController.createBusinessType
);

// READ ALL
router.get("/", businessTypeController.getAllBusinessTypes);

// READ SINGLE
router.get("/:id", businessTypeController.getBusinessTypeById);

// UPDATE (Agar icon badalna ho to new file bhej sakte hain)
router.put(
  "/:id",
  upload.single("icon"),
  businessTypeController.updateBusinessType
);

// DELETE
router.delete("/:id", businessTypeController.deleteBusinessType);

module.exports = router;