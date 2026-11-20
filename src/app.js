const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const createAuthRoutes = require("./modules/auth/auth.routes");
const createAccountRoutes = require("./modules/accounts/account.routes");
// const createVendorRoutes = require("./modules/vendor/vendor.routes");
const healthRoutes = require("./modules/health/health.routes");
const authenticate = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");
const { notFound, errorHandler } = require("./middleware/error-handler");

// Admin Routes
const adminAuthRoutes = require("./modules/admin/admin_auth/auth.routes");
const shopTypeRoutes = require("./modules/admin/shopkeeper/shoptype/shoptype.routes");
const shopCategoryRoutes = require("./modules/admin/shopkeeper/shopCategory/shopCategory.routes");
const createGroceryCartRoutes = require("./modules/user/grocery/cart/cart.routes");

// Admin - Vendor Management Routes
const businessTypeRoutes = require("./modules/admin/vendor/businessType/businessType.routes");
const shopTypeVendorRoutes = require("./modules/admin/vendor/shopType/shopType.routes");
const productCategoryRoutes = require("./modules/admin/vendor/productCategory/productCategory.routes");
const onboardingApprovalRoutes = require("./modules/admin/vendor/onboarding/onboardingApproval.routes");

// ==========================================
// Vendor Auth Routes (Send OTP / Verify OTP)
// ==========================================
const vendorAuthRoutes = require("./modules/vendor/auth/vendorAuth.routes");
const vendorDashboardRoutes = require("./modules/vendor/dashboard/dashboard.routes");
const vendorOnboardingRoutes = require("./modules/vendor/onboarding/onboarding.routes");
const vendorProductRoutes = require("./modules/vendor/products/products.routes");
const vendorProfileRoutes = require("./modules/vendor/profile/profile.routes");

// ==========================================
// User Auth Routes (Register / Login / Verify OTP)
// ==========================================
const userAuthRoutes = require("./modules/user/auth/userAuth.router");
const createOrderRoutes = require("./modules/user/orders/orders.routes");

// ==========================================
// Delivery / Rider App Routes
// ==========================================
const {
  createDeliveryModule,
  onboardingRoutes: deliveryOnboardingRoutes,
  zonesRoutes: deliveryZonesRoutes,
  uploadsRoutes: deliveryUploadsRoutes,
  ifscRoutes: deliveryIfscRoutes,
  adminRoutes: deliveryAdminRoutes,
  requestIdMiddleware,
  noSqlSanitizer,
  deliveryErrorHandler,
} = require("./modules/delivery");
const { monitoringRoutes } = require("./modules/delivery/monitoring/monitoring.routes");

function createApp(config) {
  const app = express();
  const requireAuth = authenticate(config.jwtSecret);

  app.disable("x-powered-by");

  // Helmet with cross-origin image policy enabled
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  app.use(cors({ origin: config.corsOrigin === "*" ? "*" : config.corsOrigin }));
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  // Static folder to serve uploaded icon images
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Health route
  app.use("/health", healthRoutes);
  app.use(monitoringRoutes);

  // ==========================================
  // Delivery Boy / Rider Dedicated App Routes
  // ==========================================
  app.use("/api/delivery", createDeliveryModule());
  app.use("/api/rider", createDeliveryModule());

  // Direct spec routes under /api/v1
  app.use(
    "/api/v1/rider/onboarding",
    requestIdMiddleware,
    noSqlSanitizer,
    deliveryOnboardingRoutes,
    deliveryErrorHandler
  );
  app.use(
    "/api/v1/zones",
    requestIdMiddleware,
    noSqlSanitizer,
    deliveryZonesRoutes,
    deliveryErrorHandler
  );
  app.use(
    "/api/v1/uploads",
    requestIdMiddleware,
    noSqlSanitizer,
    deliveryUploadsRoutes,
    deliveryErrorHandler
  );
  app.use(
    "/api/v1/ifsc",
    requestIdMiddleware,
    noSqlSanitizer,
    deliveryIfscRoutes,
    deliveryErrorHandler
  );
  app.use(
    "/api/v1/admin",
    requestIdMiddleware,
    noSqlSanitizer,
    deliveryAdminRoutes,
    deliveryErrorHandler
  );
  app.use(
    "/api/admin/delivery",
    requestIdMiddleware,
    noSqlSanitizer,
    deliveryAdminRoutes,
    deliveryErrorHandler
  );

  // App API Routes
  app.use("/api/v1/auth", createAuthRoutes(config));
  app.use("/api/v1/accounts", createAccountRoutes(requireAuth));
  // app.use("/api/v1/vendor", createVendorRoutes(config, requireAuth));

  // ==========================================
  // Vendor Authentication Routes Mounted Here
  // ==========================================
  app.use("/api/vendor/auth", vendorAuthRoutes);
  app.use("/api/vendor/dashboard", vendorDashboardRoutes);
  app.use("/api/vendor/onboarding", vendorOnboardingRoutes);
  app.use("/api/vendor/products", vendorProductRoutes);
  app.use("/api/vendor/profile", vendorProfileRoutes);

  // ==========================================
  // User Authentication Routes Mounted Here
  // ==========================================
  app.use("/api/user/auth", userAuthRoutes);
  app.use("/api/user/orders", createOrderRoutes(config));
  app.use("/api/user/grocery/cart", createGroceryCartRoutes(config));

  app.get(
    "/api/v1/user-app/me",
    requireAuth,
    authorize("food", "recycle", "mechanic", "grocery"),
    (req, res) => {
      res.json({
        success: true,
        data: {
          app: "user",
          categories: ["food", "recycle", "mechanic", "grocery"],
          account: req.account.toSafeJSON(),
        },
      });
    }
  );

  app.get("/api/v1/vendor/me", requireAuth, authorize("vendor"), (req, res) => {
    res.json({
      success: true,
      data: { app: "vendor", account: req.account.toSafeJSON() },
    });
  });

  app.get(
    "/api/v1/delivery/me",
    requireAuth,
    authorize("delivery_boy"),
    (req, res) => {
      res.json({
        success: true,
        data: { app: "delivery_boy", account: req.account.toSafeJSON() },
      });
    }
  );

  // Admin Routes
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/shopkeeper/shoptype", shopTypeRoutes);
  app.use("/api/admin/shopkeeper/shopcategory", shopCategoryRoutes);

  // Admin Vendor Settings Routes
  app.use("/api/admin/vendor/businesstype", businessTypeRoutes);
  app.use("/api/admin/vendor/shoptype", shopTypeVendorRoutes);
  app.use("/api/admin/vendor/productcategory", productCategoryRoutes);
  app.use("/api/admin/vendor/onboarding", onboardingApprovalRoutes);

  // Error handling middlewares
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };