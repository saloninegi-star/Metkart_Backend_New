const express = require("express");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");
const controller = require("./productCategory.controller");

const router = express.Router();

// READ ALL (No token required - available for vendor and public)
router.get("/", controller.getAllProductCategories);

// READ BY SHOP TYPE (No token required - available for vendor and public)
router.get("/by-shoptype/:shopTypeId", controller.getProductCategoriesByShopType);

// READ DETAIL BY ID (No token required)
router.get("/detail/:id", controller.getProductCategoryById);

// CREATE (Admin token required)
router.post("/:shopTypeId", verifyAdmin, controller.createProductCategory);

// UPDATE (Admin token required)
router.put("/detail/:id", verifyAdmin, controller.updateProductCategory);

// DELETE (Admin token required)
router.delete("/detail/:id", verifyAdmin, controller.deleteProductCategory);

module.exports = router;
