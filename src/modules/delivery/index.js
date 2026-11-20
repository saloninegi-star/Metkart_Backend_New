const express = require("express");
const authRoutes = require("./auth/auth.routes");
const onboardingRoutes = require("./onboarding/onboarding.routes");
const uploadsRoutes = require("./uploads/uploads.routes");
const zonesRoutes = require("./zones/zones.routes");
const ifscRoutes = require("./ifsc/ifsc.routes");
const adminRoutes = require("./admin/admin.routes");

const requestIdMiddleware = require("./middleware/requestId.middleware");
const noSqlSanitizer = require("./middleware/noSqlSanitizer.middleware");
const deliveryErrorHandler = require("./middleware/errorHandler.middleware");

function createDeliveryModule() {
  const router = express.Router();

  // Middleware pipeline for the delivery / rider module
  router.use(requestIdMiddleware);
  router.use(noSqlSanitizer);

  // Mount sub-modules
  router.use("/auth", authRoutes);
  router.use("/onboarding", onboardingRoutes);
  router.use("/uploads", uploadsRoutes);
  router.use("/zones", zonesRoutes);
  router.use("/ifsc", ifscRoutes);
  router.use("/admin", adminRoutes);

  // Module-level error handler
  router.use(deliveryErrorHandler);

  return router;
}

module.exports = {
  createDeliveryModule,
  authRoutes,
  onboardingRoutes,
  uploadsRoutes,
  zonesRoutes,
  ifscRoutes,
  adminRoutes,
  requestIdMiddleware,
  noSqlSanitizer,
  deliveryErrorHandler,
};
