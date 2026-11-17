const express = require("express");
const authenticateVendor = require("../../../middleware/vendorAuth.middleware");
const { uploadProductImages } = require("../../../middleware/vendorProductUpload.middleware");
const controller = require("./products.controller");

const router = express.Router();

router.get("/", controller.listProducts);
router.post("/", authenticateVendor(), uploadProductImages, controller.createProduct);
router.get("/:productId/images/:filename", controller.getProductImage);
router.put("/:productId", authenticateVendor(), uploadProductImages, controller.updateProduct);
router.delete("/:productId", authenticateVendor(), controller.deleteProduct);

module.exports = router;
