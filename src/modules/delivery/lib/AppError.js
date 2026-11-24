class AppError extends Error {
  /**
   * @param {string} code - Machine-readable error code (e.g. VALIDATION_ERROR, EMAIL_ALREADY_REGISTERED)
   * @param {number} httpStatus - HTTP status code (e.g. 400, 401, 403, 404, 409, 422, 429, 500, 502)
   * @param {string} message - Human-readable message
   * @param {Array|Object} [details] - Optional extra details (e.g. validation field errors)
   */
  constructor(code, httpStatus, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.statusCode = httpStatus;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
