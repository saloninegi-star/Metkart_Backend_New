function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal server error";
  let details = error.details;

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Request validation failed";
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error.code === 11000) {
    statusCode = 409;
    message = "An account with this email already exists";
  } else if (error.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large";
  } else if (error.name === "MulterError") {
    statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Uploaded file exceeds the 10 MB limit"
        : error.message;
  }

  if (statusCode >= 500) {
    console.error(error);
    message = "Internal server error";
  }

  return res.status(statusCode).json({
    success: false,
    error: { message, ...(details ? { details } : {}) },
  });
}

module.exports = { notFound, errorHandler };
