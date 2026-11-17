const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../auth/user.model");
const ApiError = require("../../../utils/ApiError");
const asyncHandler = require("../../../utils/async-handler");

function authenticateUser(jwtSecret) {
  return asyncHandler(async (req, res, next) => {
    const authorization = req.get("authorization");
    const [scheme, token] = authorization ? authorization.split(" ") : [];

    if (scheme !== "Bearer" || !token) {
      throw new ApiError(401, "User authentication token required");
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
        throw new ApiError(401, "Invalid or expired user token");
      }
      throw error;
    }

    if (payload.role !== "user" || !mongoose.Types.ObjectId.isValid(payload.id)) {
      throw new ApiError(403, "A user account is required");
    }

    const user = await User.findById(payload.id);
    if (!user || !user.isVerified) {
      throw new ApiError(401, "Verified user account not found");
    }

    req.user = user;
    next();
  });
}

module.exports = authenticateUser;
