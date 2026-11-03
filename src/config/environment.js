const dotenv = require("dotenv");

dotenv.config();

function loadEnvironment() {
  const { MONGODB_URI, JWT_SECRET } = process.env;
  const PORT = Number(process.env.PORT || 3000);
  const NODE_ENV = process.env.NODE_ENV || "development";

  if (!MONGODB_URI) {
    throw new Error("Missing required environment variable: MONGODB_URI");
  }

  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set and contain at least 32 characters");
  }

  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error("PORT must be a valid port number");
  }

  return {
    mongodbUri: MONGODB_URI,
    jwtSecret: JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    port: PORT,
    nodeEnv: NODE_ENV,
    corsOrigin: process.env.CORS_ORIGIN || "*",
  };
}

module.exports = { loadEnvironment };
