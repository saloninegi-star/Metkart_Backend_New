const crypto = require("crypto");

function requestIdMiddleware(req, res, next) {
  const incomingId = req.get("x-request-id") || req.get("X-Request-Id");
  const requestId = incomingId || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

module.exports = requestIdMiddleware;
