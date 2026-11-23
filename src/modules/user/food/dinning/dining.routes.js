const express = require("express");
const authenticateUser = require("./dining.middleware");
const {
  createDiningBooking,
  getDiningBookings,
  getDiningBookingsByUserId,
  getDiningBookingById,
  getRestaurantDiningBookings,
} = require("./dining.controller");

function createDiningRoutes(config) {
  const router = express.Router();
  const requireUser = authenticateUser(config.jwtSecret);

  // Create table reservation (Requires user token)
  router.post("/", requireUser, createDiningBooking);

  // Get dining reservations (No authentication required)
  router.get("/", getDiningBookings);

  // Get reservations by userId (No authentication required)
  router.get("/user/:userId", getDiningBookingsByUserId);

  // Get restaurant's reservations by restaurantId (No authentication required)
  router.get("/restaurant/:restaurantId", getRestaurantDiningBookings);

  // Get single reservation by ID (No authentication required)
  router.get("/:id", getDiningBookingById);

  return router;
}

module.exports = createDiningRoutes;
