const AppError = require("../lib/AppError");

function deliveryErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || req.get("x-request-id") || req.get("X-Request-Id") || "unknown";

  // 1. AppError
  if (err instanceof AppError) {
    const responsePayload = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    };
    if (err.details !== undefined) {
      responsePayload.error.details = err.details;
    }
    return res.status(err.httpStatus).json(responsePayload);
  }

  // 2. MongoDB duplicate key error (code 11000)
  if (err.code === 11000) {
    let code = "DUPLICATE_KEY";
    let message = "Duplicate key conflict";
    const keyPattern = err.keyPattern || {};

    if (keyPattern.email) {
      code = "EMAIL_ALREADY_REGISTERED";
      message = "An account with this email already exists";
    } else if (keyPattern.phone) {
      code = "PHONE_ALREADY_USED";
      message = "This phone number is already registered to another rider";
    } else if (keyPattern.vehicleNumber) {
      code = "VEHICLE_ALREADY_REGISTERED";
      message = "This vehicle number is already registered to another rider";
    } else if (keyPattern.aadhaarHmac) {
      code = "IDENTITY_ALREADY_REGISTERED";
      message = "This identity document is already registered to another rider";
    } else if (keyPattern.tokenHash) {
      code = "INVALID_CREDENTIALS";
      message = "Token conflict detected";
    }

    return res.status(409).json({
      success: false,
      error: {
        code,
        message,
        requestId,
      },
    });
  }

  // 3. Syntax / JSON parse error
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: "BAD_REQUEST",
        message: "Malformed JSON payload",
        requestId,
      },
    });
  }

  // 4. Multer errors
  if (err.name === "MulterError") {
    const isTooLarge = err.code === "LIMIT_FILE_SIZE";
    return res.status(isTooLarge ? 413 : 400).json({
      success: false,
      error: {
        code: isTooLarge ? "FILE_TOO_LARGE" : "BAD_REQUEST",
        message: isTooLarge ? "Uploaded file exceeds maximum allowed size" : err.message,
        requestId,
      },
    });
  }

  // 5. Unknown unexpected server errors
  console.error(`[INTERNAL_ERROR] [${requestId}]`, err);

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An internal server error occurred",
      requestId,
    },
  });
}

module.exports = deliveryErrorHandler;
