const express = require("express");
const authenticateVendor = require("../../../../middleware/vendorAuth.middleware");
const { uploadMenuFiles } = require("./menu.upload.middleware");
const {
  createOrUpdateMenu,
  getMenuByRestaurantId,
  getAllMenus,
  getMenuById,
  getRestaurantQrCode,
  updateMenu,
  updateProduct,
  deleteMenu,
  deleteProduct,
} = require("./menu.controller");

function createMenuRoutes(config = {}) {
  const router = express.Router();
  const requireVendor = authenticateVendor(config.jwtSecret);

  // POST Create or update menu (Vendor Token Required, Form-Data)
  router.post("/", requireVendor, uploadMenuFiles, createOrUpdateMenu);

  // PUT / PATCH Update menu category / products (Vendor Token Required)
  router.put("/:id", requireVendor, uploadMenuFiles, updateMenu);
  router.put("/", requireVendor, uploadMenuFiles, updateMenu);
  router.patch("/:id", requireVendor, uploadMenuFiles, updateMenu);
  router.patch("/", requireVendor, uploadMenuFiles, updateMenu);

  // PUT / PATCH Update single product in a menu (Vendor Token Required)
  router.put("/:menuId/product/:productId", requireVendor, uploadMenuFiles, updateProduct);
  router.patch("/:menuId/product/:productId", requireVendor, uploadMenuFiles, updateProduct);
  router.put("/product/:productId", requireVendor, uploadMenuFiles, updateProduct);
  router.patch("/product/:productId", requireVendor, uploadMenuFiles, updateProduct);

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
  router.delete("/", requireVendor, deleteMenu);

  // DELETE Single product from menu (Vendor Token Required)
  router.delete("/:menuId/product/:productId", requireVendor, deleteProduct);
  router.delete("/product/:productId", requireVendor, deleteProduct);

  return router;
}

module.exports = createMenuRoutes;
