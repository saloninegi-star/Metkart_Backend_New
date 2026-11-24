const AppError = require("../lib/AppError");

// In-memory sliding window bucket store with automatic expiration
const stores = new Map();

function getStore(name) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name);
}

/**
 * Creates a rate limit middleware.
 *
 * @param {Object} options
 * @param {string} options.name - Bucket group name
 * @param {number} options.max - Maximum requests allowed in window
 * @param {number} options.windowMs - Window duration in milliseconds
 * @param {Function} [options.keyGenerator] - Function extracting rate limit key from req
 */
function createRateLimiter({ name, max, windowMs, keyGenerator }) {
  const store = getStore(name);

  // Periodic cleanup every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime <= now) {
        store.delete(key);
      }
    }
  }, 300000).unref();

  return (req, res, next) => {
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.connection.remoteAddress || "global";

    const now = Date.now();
    let record = store.get(key);

    if (!record || record.resetTime <= now) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      return next(
        new AppError(
          "RATE_LIMITED",
          429,
          "Too many requests, please try again later",
          { retryAfterSeconds }
        )
      );
    }

    next();
  };
}

// 1. Auth endpoints: 10 requests per minute per IP
const authRateLimiter = createRateLimiter({
  name: "delivery_auth",
  max: 10,
  windowMs: 60 * 1000,
  keyGenerator: (req) => `ip_${req.ip || "unknown"}`,
});

// 2. OTP send: 5 per hour per user/email
const otpSendRateLimiter = createRateLimiter({
  name: "delivery_otp",
  max: 5,
  windowMs: 60 * 60 * 1000,
  keyGenerator: (req) =>
    `otp_${req.body?.email || req.rider?.email || req.ip || "unknown"}`,
});

// 3. Authenticated routes: 120 per minute per user
const generalRateLimiter = createRateLimiter({
  name: "delivery_general",
  max: 120,
  windowMs: 60 * 1000,
  keyGenerator: (req) => `user_${req.rider?.id || req.ip || "unknown"}`,
});

module.exports = {
  createRateLimiter,
  authRateLimiter,
  otpSendRateLimiter,
  generalRateLimiter,
};
