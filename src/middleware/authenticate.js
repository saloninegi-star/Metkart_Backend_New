const jwt = require("jsonwebtoken");
const { getAccountById } = require("../modules/accounts/account.service");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/async-handler");

function authenticate(jwtSecret) {
  return asyncHandler(async (req, res, next) => {
    const authorization = req.get("authorization");
    const [scheme, token] = authorization ? authorization.split(" ") : [];

    if (scheme !== "Bearer" || !token) {
      throw new ApiError(401, "Authentication token required");
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (error) {
      if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
        throw new ApiError(401, "Invalid or expired authentication token");
      }
      throw error;
    }

    const account = await getAccountById(payload.sub);
    if (!account) {
      throw new ApiError(401, "Account no longer exists");
    }
    if (payload.tokenVersion !== account.tokenVersion) {
      throw new ApiError(401, "Password changed; please sign in again");
    }

    req.account = account;
    next();
  });
}

module.exports = authenticate;
