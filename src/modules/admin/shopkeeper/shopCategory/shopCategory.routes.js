const express = require("express");
const router = express.Router();
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");
const {
  createCategory,
  getCategoriesByShopType,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("./shopCategory.controller");

// 1. Get all categories across all shop types (Admin)
router.get("/", verifyAdmin, getAllCategories);

// 2. ShopType ID in PARAMS routes:
router.post("/:shopTypeId", verifyAdmin, createCategory);

// GET
router.get("/:shopTypeId", getCategoriesByShopType);

// 3. Category ID specific routes (Detail, Update, Delete)
router.get("/detail/:id", verifyAdmin, getCategoryById);
router.put("/detail/:id", verifyAdmin, updateCategory);
router.delete("/detail/:id", verifyAdmin, deleteCategory);

module.exports = router;