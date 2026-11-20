const jwt = require("jsonwebtoken");
const { deliveryEnv } = require("../config/env");
const AppError = require("../lib/AppError");

async function adminAuth(req, res, next) {
  const authHeader = req.get("authorization") || req.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("UNAUTHENTICATED", 401, "Admin token missing"));
  }

  const token = authHeader.slice(7).trim();
  let payload;
  try {
    payload = jwt.verify(token, deliveryEnv.JWT_SECRET);
  } catch (err) {
    return next(new AppError("UNAUTHENTICATED", 401, "Invalid or expired admin token"));
  }

  const role = payload.role ? String(payload.role).toUpperCase() : "";
  if (role !== "ADMIN" && role !== "SUPERADMIN") {
    return next(new AppError("FORBIDDEN", 403, "Administrator privilege required"));
  }

  req.admin = {
    id: payload.id || payload.sub,
    role: payload.role,
    email: payload.email,
  };

  next();
}

module.exports = adminAuth;
