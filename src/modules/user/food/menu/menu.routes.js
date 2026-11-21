const express = require("express");
const authenticateVendor = require("../../../../middleware/vendorAuth.middleware");
const { uploadMenuFiles } = require("./menu.upload.middleware");
const {
  createOrUpdateMenu,
  getMenuByRestaurantId,
  getAllMenus,
  getMenuById,
  getRestaurantQrCode,
  deleteMenu,
  deleteProduct,
} = require("./menu.controller");

function createMenuRoutes(config = {}) {
  const router = express.Router();
  const requireVendor = authenticateVendor(config.jwtSecret);

  // POST Create or update menu (Vendor Token Required, Form-Data)
  router.post("/", requireVendor, uploadMenuFiles, createOrUpdateMenu);

  // GET All menus (Public - No Token Required)
  router.get("/", getAllMenus);

  // GET QR code specifically (Public - No Token Required)
  router.get("/qr/:restaurantId", getRestaurantQrCode);

  // GET Single menu category by ID (Public - No Token Required)
  router.get("/category/:id", getMenuById);

  // GET Menu by Restaurant ID (Public - No Token Required)
  router.get("/:restaurantId", getMenuByRestaurantId);

  // DELETE Menu category (Vendor Token Required)
  router.delete("/:id", requireVendor, deleteMenu);

  // DELETE Single product from menu (Vendor Token Required)
  router.delete("/:menuId/product/:productId", requireVendor, deleteProduct);

  return router;
}

module.exports = createMenuRoutes;
