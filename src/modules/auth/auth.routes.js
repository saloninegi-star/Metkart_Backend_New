const express = require("express");
const rateLimit = require("express-rate-limit");
const createAuthController = require("./auth.controller");
const deliveryAuthController = require("../delivery/auth/auth.controller");
const {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  refreshSchema,
} = require("../delivery/auth/auth.validation");
const validate = require("../delivery/middleware/validate.middleware");
const idempotencyMiddleware = require("../delivery/middleware/idempotency.middleware");

function createAuthRoutes(config) {
  const router = express.Router();
  const controller = createAuthController(config);
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      error: { message: "Too many authentication attempts; try again later" },
    },
  });

  // Dual-role register: Dispatches to Rider registration when role is RIDER
  router.post(
    "/register",
    authRateLimit,
    idempotencyMiddleware(),
    (req, res, next) => {
      if (req.body && req.body.role === "RIDER") {
        return validate({ body: registerSchema })(req, res, () => {
          deliveryAuthController.register(req, res, next);
        });
      }
      return controller.register(req, res, next);
    }
  );

  // Dual login: Checks delivery rider if user app login fails or user role is RIDER
  router.post("/login", authRateLimit, (req, res, next) => {
    // Try customer login first; if invalid or account not found, try rider login
    controller.login(req, res, (err) => {
      if (err && (err.statusCode === 401 || err.statusCode === 400)) {
        return deliveryAuthController.login(req, res, next);
      }
      return next(err);
    });
  });

  // Rider auth endpoints specified under /auth/*
  router.post(
    "/otp/verify",
    authRateLimit,
    validate({ body: verifyOtpSchema }),
    deliveryAuthController.verifyOtp
  );

  router.post(
    "/otp/resend",
    authRateLimit,
    idempotencyMiddleware(),
    validate({ body: resendOtpSchema }),
    deliveryAuthController.resendOtp
  );

  router.post(
    "/refresh",
    authRateLimit,
    validate({ body: refreshSchema }),
    deliveryAuthController.refresh
  );

  return router;
}

module.exports = createAuthRoutes;
