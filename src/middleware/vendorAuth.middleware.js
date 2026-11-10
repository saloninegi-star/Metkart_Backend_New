const jwt = require("jsonwebtoken");
const Vendor = require("../modules/vendor/auth/vendorAuth.model");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/async-handler");

function authenticateVendor(jwtSecret = process.env.JWT_SECRET || "your_metkart_jwt_secret_key") {
  return asyncHandler(async (req, res, next) => {
    const authorization = req.get("authorization");
    const [scheme, token] = authorization ? authorization.split(" ") : [];

    if (scheme !== "Bearer" || !token) {
      throw new ApiError(401, "Vendor authentication token required");
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
        throw new ApiError(401, "Invalid or expired vendor token");
      }
      throw error;
    }

    if (payload.role !== "vendor" || !payload.id) {
      throw new ApiError(403, "A vendor account is required");
    }

    const vendor = await Vendor.findById(payload.id);
    if (!vendor || !vendor.isEmailVerified) {
      throw new ApiError(401, "Verified vendor account not found");
    }
    if (vendor.status === "blocked") {
      throw new ApiError(403, "Vendor account is blocked");
    }

    req.vendor = vendor;
    next();
  });
}

module.exports = authenticateVendor;
