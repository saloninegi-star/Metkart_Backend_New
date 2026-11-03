const express = require("express");
const rateLimit = require("express-rate-limit");
const authorize = require("../../middleware/authorize");
const createVendorController = require("./vendor.controller");

function createVendorRoutes(config, authenticate) {
  const router = express.Router();
  const controller = createVendorController(config);
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      error: { message: "Too many authentication attempts; try again later" },
    },
  });

  router.post("/register", authRateLimit, controller.register);
  router.post("/login", authRateLimit, controller.login);
  router.get("/profile", authenticate, authorize("vendor"), controller.getProfile);
  router.patch("/profile", authenticate, authorize("vendor"), controller.updateProfile);
  router.patch(
    "/change-password",
    authenticate,
    authorize("vendor"),
    controller.updatePassword
  );

  return router;
}

module.exports = createVendorRoutes;
