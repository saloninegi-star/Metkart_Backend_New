const express = require("express");
const router = express.Router();
const upload = require("../../../../middleware/upload.middleware");
const {
  createShopType,
  getAllShopTypes,
  getActiveShopTypes,
  getShopTypeById,
  updateShopType,
  deleteShopType,
} = require("./shoptype.controller");

const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");

// Public Route (App UI par list dikhane ke liye)
router.get("/active", getActiveShopTypes);

// Admin Protected CRUD Routes (with Image Upload)
router.post("/", verifyAdmin, upload.single("icon"), createShopType);
router.get("/", verifyAdmin, getAllShopTypes);
router.get("/:id", verifyAdmin, getShopTypeById);
router.put("/:id", verifyAdmin, upload.single("icon"), updateShopType);
router.delete("/:id", verifyAdmin, deleteShopType);

module.exports = router;