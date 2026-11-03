const ApiError = require("../utils/ApiError");

function authorize(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.account || !allowedRoles.includes(req.account.role)) {
      return next(new ApiError(403, "You do not have access to this resource"));
    }
    return next();
  };
}

module.exports = authorize;
