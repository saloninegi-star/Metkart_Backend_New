const express = require("express");
const authController = require("./auth.controller");
const {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  refreshSchema,
} = require("./auth.validation");
const validate = require("../middleware/validate.middleware");
const idempotencyMiddleware = require("../middleware/idempotency.middleware");
const {
  authRateLimiter,
  otpSendRateLimiter,
} = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.post(
  "/register",
  authRateLimiter,
  idempotencyMiddleware(),
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  "/otp/verify",
  authRateLimiter,
  validate({ body: verifyOtpSchema }),
  authController.verifyOtp
);

router.post(
  "/otp/resend",
  otpSendRateLimiter,
  idempotencyMiddleware(),
  validate({ body: resendOtpSchema }),
  authController.resendOtp
);

router.post(
  "/login",
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.post(
  "/refresh",
  authRateLimiter,
  validate({ body: refreshSchema }),
  authController.refresh
);

module.exports = router;
