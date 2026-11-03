const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const createAuthRoutes = require("./modules/auth/auth.routes");
const createAccountRoutes = require("./modules/accounts/account.routes");
const createVendorRoutes = require("./modules/vendor/vendor.routes");
const healthRoutes = require("./modules/health/health.routes");
const authenticate = require("./middleware/authenticate");
const authorize = require("./middleware/authorize");
const { notFound, errorHandler } = require("./middleware/error-handler");

function createApp(config) {
  const app = express();
  const requireAuth = authenticate(config.jwtSecret);

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin === "*" ? "*" : config.corsOrigin }));
  app.use(express.json({ limit: "10kb" }));

  app.use("/health", healthRoutes);
  app.use("/api/v1/auth", createAuthRoutes(config));
  app.use("/api/v1/accounts", createAccountRoutes(requireAuth));
  app.use("/api/v1/vendor", createVendorRoutes(config, requireAuth));

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

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
