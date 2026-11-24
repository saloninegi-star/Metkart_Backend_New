const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/**
 * Returns a 32-byte Buffer from the given encryption key string.
 */
function getKeyBuffer(keyString) {
  if (!keyString) {
    throw new Error("Encryption key is required");
  }
  return crypto.createHash("sha256").update(String(keyString)).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Format returned: keyId:ivHex:tagHex:encryptedHex
 *
 * @param {string} plaintext
 * @param {string} keyString
 * @param {string} keyId
 * @returns {string} Encrypted string with keyId and authentication tag
 */
function encryptAesGcm(plaintext, keyString, keyId = "k1") {
  if (plaintext === null || plaintext === undefined) return null;
  const key = getKeyBuffer(keyString);
  const iv = crypto.randomBytes(12); // standard 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(String(plaintext), "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return `${keyId}:${iv.toString("hex")}:${tag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM ciphertext in format keyId:ivHex:tagHex:encryptedHex
 *
 * @param {string} payload
 * @param {string} keyString
 * @returns {string} Decrypted plaintext
 */
function decryptAesGcm(payload, keyString) {
  if (!payload || typeof payload !== "string") return null;
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted payload format");
  }

  const [, ivHex, tagHex, encryptedHex] = parts;
  const key = getKeyBuffer(keyString);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Computes HMAC-SHA256 of value using keyString.
 *
 * @param {string} value
 * @param {string} keyString
 * @returns {string} Hex HMAC
 */
function hmacSha256(value, keyString) {
  if (!value || !keyString) return null;
  return crypto.createHmac("sha256", keyString).update(String(value)).digest("hex");
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function constantTimeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Perform dummy timingSafeEqual against a clone of bufA to maintain constant time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Hashes password using bcrypt.
 *
 * @param {string} password
 * @param {number} rounds
 * @returns {Promise<string>}
 */
async function hashPassword(password, rounds = 12) {
  return bcrypt.hash(password, rounds);
}

/**
 * Compares password with bcrypt hash.
 *
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
  if (!hash) {
    // Run dummy compare to mitigate timing enumeration
    await bcrypt.compare(
      password,
      "$2a$12$e80yqV8q63n1/mE.88dY1eXjAUp.nFk6M5l5b.vR3j0Q8Fm62x4iq"
    );
    return false;
  }
  return bcrypt.compare(password, hash);
}

module.exports = {
  encryptAesGcm,
  decryptAesGcm,
  hmacSha256,
  constantTimeCompare,
  hashPassword,
  comparePassword,
};
