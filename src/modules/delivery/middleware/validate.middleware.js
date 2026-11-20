const AppError = require("../lib/AppError");

/**
 * Validates request body, params, and query using Zod schemas.
 *
 * @param {Object} schemas
 * @param {import("zod").ZodTypeAny} [schemas.body]
 * @param {import("zod").ZodTypeAny} [schemas.params]
 * @param {import("zod").ZodTypeAny} [schemas.query]
 */
function validate({ body, params, query }) {
  return (req, res, next) => {
    const errorDetails = [];

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errorDetails.push({
            field: issue.path.join(".") || "params",
            message: issue.message,
          });
        }
      } else {
        req.params = result.data;
      }
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errorDetails.push({
            field: issue.path.join(".") || "query",
            message: issue.message,
          });
        }
      } else {
        req.query = result.data;
      }
    }

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errorDetails.push({
            field: issue.path.join(".") || "body",
            message: issue.message,
          });
        }
      } else {
        req.body = result.data;
      }
    }

    if (errorDetails.length > 0) {
      return next(
        new AppError("VALIDATION_ERROR", 422, "Request validation failed", errorDetails)
      );
    }

    next();
  };
}

module.exports = validate;
