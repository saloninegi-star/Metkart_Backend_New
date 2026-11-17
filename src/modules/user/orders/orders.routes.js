const express = require("express");
const authenticateUser = require("./orders.middleware");
const { createOrder } = require("./orders.controller");

function createOrderRoutes(config) {
  const router = express.Router();
  router.post("/", authenticateUser(config.jwtSecret), createOrder);
  return router;
}

module.exports = createOrderRoutes;
