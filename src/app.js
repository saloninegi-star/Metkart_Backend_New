const express = require("express");
const fs = require("fs");
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
const vendorAuthController = require("./modules/vendor/auth/vendorAuth.controller");
const authenticateVendor = require("./middleware/vendorAuth.middleware");
const vendorDashboardRoutes = require("./modules/vendor/dashboard/dashboard.routes");
const vendorOnboardingRoutes = require("./modules/vendor/onboarding/onboarding.routes");
const vendorProductRoutes = require("./modules/vendor/products/products.routes");
const vendorProfileRoutes = require("./modules/vendor/profile/profile.routes");

// ==========================================
// User Auth Routes (Register / Login / Verify OTP)
// ==========================================
const userAuthRoutes = require("./modules/user/auth/userAuth.router");
const createOrderRoutes = require("./modules/user/orders/orders.routes");
const createDiningRoutes = require("./modules/user/food/dinning/dining.routes");
const createMenuRoutes = require("./modules/user/food/menu/menu.routes");

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

  // Dedicated QR code route ensuring QR codes always point to live API even on ephemeral host
  app.get("/storage/restaurant-menu/qr-:restaurantId.png", async (req, res, next) => {
    try {
      const { restaurantId } = req.params;
      const QRCode = require("qrcode");
      const storageDir = path.join(process.cwd(), "storage", "restaurant-menu");
      const filePath = path.join(storageDir, `qr-${restaurantId}.png`);
      const host = req.get("x-forwarded-host") || req.get("host") || "metkart-backend-new.onrender.com";
      const proto = req.get("x-forwarded-proto") || req.protocol || "https";
      const targetUrl = (host && !host.includes("localhost") && !host.includes("127.0.0.1"))
        ? `${proto}://${host}/api/user/food/menu/${restaurantId}`
        : `https://metkart-backend-new.onrender.com/api/user/food/menu/${restaurantId}`;

      fs.mkdirSync(storageDir, { recursive: true });
      await QRCode.toFile(filePath, targetUrl, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 320,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      return res.sendFile(filePath);
    } catch (err) {
      return next(err);
    }
  });

  app.use("/storage", express.static(path.join(process.cwd(), "storage")));

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
  app.post("/vendor/complete-registration", authenticateVendor(), vendorAuthController.completeRegistration);
  app.post("/api/vendor/complete-registration", authenticateVendor(), vendorAuthController.completeRegistration);
  app.use("/api/vendor/dashboard", vendorDashboardRoutes);
  app.use("/api/vendor/onboarding", vendorOnboardingRoutes);
  app.use("/api/vendor/products", vendorProductRoutes);
  app.use("/api/vendor/profile", vendorProfileRoutes);
  app.use("/api/vendor/businesstype", businessTypeRoutes);
  app.use("/api/vendor/shoptype", shopTypeVendorRoutes);
  app.use("/api/vendor/productcategory", productCategoryRoutes);
  app.use("/api/vendor/menu", createMenuRoutes(config));

  // ==========================================  
  // User Authentication Routes Mounted Here
  // ==========================================
  app.use("/api/user/auth", userAuthRoutes);
  app.use("/api/user/orders", createOrderRoutes(config));
  app.use("/api/user/grocery/cart", createGroceryCartRoutes(config));
  app.use("/api/user/food/dining", createDiningRoutes(config));
  app.use("/api/user/food/dinning", createDiningRoutes(config));
  app.use("/api/user/food/menu", createMenuRoutes(config));

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