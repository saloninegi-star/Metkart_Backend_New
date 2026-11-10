const express = require("express");
const router = express.Router();
const shopTypeController = require("./shopType.controller");
const upload = require("../../../../middleware/upload.middleware");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");

router.use(verifyAdmin);

// 1. CREATE: businessTypeId URL params mein aayegi
router.post(
  "/:businessTypeId",
  upload.single("icon"),
  shopTypeController.createShopType
);

// 2. GET ALL by Business Type ID (Params se)
router.get(
  "/by-business/:businessTypeId",
  shopTypeController.getShopTypesByBusinessType
);

// 3. GET SINGLE Shop Type by its ID
router.get("/:id", shopTypeController.getShopTypeById);

// 4. UPDATE Shop Type by ID
router.put(
  "/:id",
  upload.single("icon"),
  shopTypeController.updateShopType
);

// 5. DELETE Shop Type by ID
router.delete("/:id", shopTypeController.deleteShopType);

module.exports = router;