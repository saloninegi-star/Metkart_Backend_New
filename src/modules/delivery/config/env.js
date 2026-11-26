const { z } = require("zod");
const dotenv = require("dotenv");

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default("info"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_POOL_MAX: z.coerce.number().int().positive().default(20),
  MONGODB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PROVIDER_MODE: z.enum(["mock", "real"]).default("mock"),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(6).default(6),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(45),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  RESET_TOKEN_EXPIRY_SECONDS: z.coerce.number().int().positive().default(900),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  LOGIN_ATTEMPT_WINDOW_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
  LOGIN_LOCKOUT_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5242880),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  DATA_ENCRYPTION_KEY: z
    .string()
    .min(32, "DATA_ENCRYPTION_KEY must be at least 32 characters")
    .default("0123456789abcdef0123456789abcdef"),
  DATA_ENCRYPTION_KEY_ID: z.string().default("k1"),
  AADHAAR_HMAC_KEY: z
    .string()
    .min(32, "AADHAAR_HMAC_KEY must be at least 32 characters")
    .default("0123456789abcdef0123456789abcdef"),
  CORS_ALLOWED_ORIGINS: z.string().default("*"),
  MEDICAL_COVER_INR: z.coerce.number().int().positive().default(100000),
  ACCIDENTAL_COVER_INR: z.coerce.number().int().positive().default(1000000),
  SELFIE_MAX_ATTEMPTS_PER_DAY: z.coerce.number().int().positive().default(5),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

function getDeliveryEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Delivery module environment configuration error: ${errorDetails}`);
  }
  return parsed.data;
}

module.exports = {
  getDeliveryEnv,
  deliveryEnv: getDeliveryEnv(),
};
