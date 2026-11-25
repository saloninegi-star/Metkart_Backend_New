const express = require("express");
const router = express.Router();
const shopTypeController = require("./shopType.controller");
const upload = require("../../../../middleware/upload.middleware");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");

// 1. GET ALL Shop Types (No token required - available for vendor and public)
router.get("/", shopTypeController.getAllShopTypes);

// 2. GET ALL by Business Type ID (Params se - No token required)
router.get(
  "/by-business/:businessTypeId",
  shopTypeController.getShopTypesByBusinessType
);

// 3. GET SINGLE Shop Type by its ID (No token required)
router.get("/:id", shopTypeController.getShopTypeById);

// 4. CREATE: businessTypeId URL params mein aayegi (Requires Admin token)
router.post(
  "/:businessTypeId",
  verifyAdmin,
  upload.single("icon"),
  shopTypeController.createShopType
);

// 5. UPDATE Shop Type by ID (Requires Admin token)
router.put(
  "/:id",
  verifyAdmin,
  upload.single("icon"),
  shopTypeController.updateShopType
);

// 6. DELETE Shop Type by ID (Requires Admin token)
router.delete("/:id", verifyAdmin, shopTypeController.deleteShopType);

module.exports = router;
