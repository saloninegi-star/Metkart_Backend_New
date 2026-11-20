const AppError = require("../lib/AppError");

function containsOperatorOrDot(obj) {
  if (!obj || typeof obj !== "object") return false;

  for (const key of Object.keys(obj)) {
    if (key.startsWith("$") || key.includes(".")) {
      return true;
    }
    const val = obj[key];
    if (val && typeof val === "object") {
      if (containsOperatorOrDot(val)) {
        return true;
      }
    }
  }
  return false;
}

function noSqlSanitizer(req, res, next) {
  if (req.body && containsOperatorOrDot(req.body)) {
    return next(
      new AppError("VALIDATION_ERROR", 422, "Request contains illegal operator or dot notation", [
        { field: "body", message: "Prohibited character ($ or .) in property key" },
      ])
    );
  }
  if (req.query && containsOperatorOrDot(req.query)) {
    return next(
      new AppError("VALIDATION_ERROR", 422, "Query contains illegal operator or dot notation", [
        { field: "query", message: "Prohibited character ($ or .) in parameter key" },
      ])
    );
  }
  next();
}

module.exports = noSqlSanitizer;
