const express = require("express");
const { verifyAdmin } = require("../../../../middleware/adminAuth.middleware");
const controller = require("./productCategory.controller");

const router = express.Router();
router.use(verifyAdmin);

router.get("/", controller.getAllProductCategories);
router.get("/by-shoptype/:shopTypeId", controller.getProductCategoriesByShopType);
router.post("/:shopTypeId", controller.createProductCategory);
router.get("/detail/:id", controller.getProductCategoryById);
router.put("/detail/:id", controller.updateProductCategory);
router.delete("/detail/:id", controller.deleteProductCategory);

module.exports = router;
