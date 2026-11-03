const express = require("express");
const rateLimit = require("express-rate-limit");
const createAuthController = require("./auth.controller");

function createAuthRoutes(config) {
  const router = express.Router();
  const controller = createAuthController(config);
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
  return router;
}

module.exports = createAuthRoutes;
