const jwt = require("jsonwebtoken");
const { deliveryEnv } = require("../config/env");
const { RiderUser } = require("../models");
const AppError = require("../lib/AppError");

async function riderAuth(req, res, next) {
  const authHeader = req.get("authorization") || req.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError("UNAUTHENTICATED", 401, "Authentication token required"));
  }

  const token = authHeader.slice(7).trim();
  let payload;
  try {
    payload = jwt.verify(token, deliveryEnv.JWT_SECRET);
  } catch (err) {
    return next(new AppError("UNAUTHENTICATED", 401, "Invalid or expired authentication token"));
  }

  if (payload.role !== "RIDER") {
    return next(new AppError("FORBIDDEN", 403, "Access restricted to rider accounts"));
  }

  const user = await RiderUser.findById(payload.sub).lean();
  if (!user || user.status !== "ACTIVE") {
    return next(new AppError("UNAUTHENTICATED", 401, "Rider account does not exist or is inactive"));
  }

  if (!user.emailVerifiedAt) {
    return next(new AppError("EMAIL_NOT_VERIFIED", 403, "Email address has not been verified"));
  }

  req.rider = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt,
  };

  next();
}

module.exports = riderAuth;
