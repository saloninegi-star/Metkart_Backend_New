const express = require("express");
const authenticateUser = require("./orders.middleware");
const { verifyAdmin } = require("../../../middleware/adminAuth.middleware");
const {
  createOrder,
  getOrdersByUserId,
  getAllOrders,
  getOrdersByVendorId,
} = require("./orders.controller");

function createOrderRoutes(config) {
  const router = express.Router();

  // User Order creation
  router.post("/", authenticateUser(config.jwtSecret), createOrder);

  // Admin route (requires admin Bearer token)
  router.get("/all", verifyAdmin, getAllOrders);

  // Vendor orders route (does NOT require admin token)
  router.get("/vendor/:vendorId", getOrdersByVendorId);

  // User route by userId in params (does NOT require authentication)
  router.get("/:userId", getOrdersByUserId);

  return router;
}

module.exports = createOrderRoutes;
