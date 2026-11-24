const crypto = require("crypto");
const mongoose = require("mongoose");
const { IdempotencyKey } = require("../models");
const AppError = require("../lib/AppError");

function hashPayload(body) {
  const json = JSON.stringify(body || {});
  return crypto.createHash("sha256").update(json).digest("hex");
}

function idempotencyMiddleware() {
  return async (req, res, next) => {
    const key = req.get("Idempotency-Key") || req.get("idempotency-key");
    if (!key) {
      return next();
    }

    const userId = req.rider?.id || req.body?.userId || req.account?._id || new mongoose.Types.ObjectId("000000000000000000000000");
    const requestHash = hashPayload(req.body);

    try {
      const existing = await IdempotencyKey.findOne({ key, userId }).lean();
      if (existing) {
        if (existing.requestHash !== requestHash) {
          return next(
            new AppError(
              "IDEMPOTENCY_KEY_REUSED",
              422,
              "Idempotency key reused with a different request payload"
            )
          );
        }
        return res.status(existing.responseStatus).json(existing.responseBody);
      }

      // Intercept res.json to store the response
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Asynchronously save to idempotency_keys
        if (res.statusCode >= 200 && res.statusCode < 300) {
          IdempotencyKey.create({
            key,
            userId,
            requestHash,
            responseStatus: res.statusCode,
            responseBody: body,
          }).catch((err) => {
            console.error("Failed to store idempotency key:", err);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = idempotencyMiddleware;
