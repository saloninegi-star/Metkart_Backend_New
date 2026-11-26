const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const CircuitBreaker = require("./circuitBreaker");
const AppError = require("../lib/AppError");
const { deliveryEnv } = require("../config/env");
const { sendOtpEmail } = require("../../../utils/mailer");

// 1. Email Provider
class EmailProvider {
  constructor() {
    this.breaker = new CircuitBreaker("EmailProvider");
  }

  async sendOtp(email, code, options = {}) {
    return this.breaker.execute(async () => {
      let emailSent = false;
      const fullName = options.fullName || "Rider";

      // If SMTP credentials or Brevo fallback API key are configured, send real email
      if ((process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.BREVO_API_KEY) {
        try {
          await sendOtpEmail(email, code, fullName, options);
          console.log(`[EmailProvider] Real email OTP successfully sent to: ${email}`);
          emailSent = true;
        } catch (err) {
          console.error(`[EmailProvider] Failed to send email:`, err.message);
          if (deliveryEnv.PROVIDER_MODE === "real") {
            throw new AppError("PROVIDER_UNAVAILABLE", 502, `Failed to send email OTP: ${err.message}`);
          }
        }
      }

      if (!emailSent) {
        if (deliveryEnv.NODE_ENV === "production") {
          console.log(`[EmailProvider] OTP sent to email: ${email.replace(/(.{2})(.*)(?=@)/, "$1***")}`);
        } else {
          console.log(`[EmailProvider] Mock sending OTP to ${email}: code=${code}`);
        }
      }

      return { sent: true };
    });
  }
}

// 2. KYC Provider
class KycProvider {
  constructor() {
    this.breaker = new CircuitBreaker("KycProvider");
  }

  async aadhaarSendOtp(aadhaarNumber) {
    return this.breaker.execute(async () => {
      const referenceId = `ref_adh_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      return { referenceId, expiresInSeconds: 600, resendAfterSeconds: 45 };
    });
  }

  async aadhaarVerifyOtp(referenceId, otp, aadhaarNumber = null) {
    return this.breaker.execute(async () => {
      // In mock mode valid code is 123456
      if (otp !== "123456") {
        return { verified: false, error: "OTP_INVALID" };
      }
      return {
        verified: true,
        name: "Test Rider",
      };
    });
  }

  async verifyPan(panNumber, name) {
    return this.breaker.execute(async () => {
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
        return { verified: false, error: "INVALID_PAN_FORMAT" };
      }
      return {
        verified: true,
        name: name || "Test Rider",
      };
    });
  }
}

// 3. Face Match Provider
class FaceMatchProvider {
  constructor() {
    this.breaker = new CircuitBreaker("FaceMatchProvider");
  }

  async check(selfieRecord, referenceRecord = null) {
    return this.breaker.execute(async () => {
      const keyOrName = selfieRecord?.storageKey || selfieRecord?.fileName || "";
      if (keyOrName.toLowerCase().includes("fail.jpg") || keyOrName.toLowerCase().includes("fail")) {
        return {
          passed: false,
          livenessPassed: false,
          matchScore: 0.15,
          reasonCode: "NO_FACE",
        };
      }
      return {
        passed: true,
        livenessPassed: true,
        matchScore: 0.92,
        reasonCode: null,
      };
    });
  }
}

// 4. Bank Provider
const IFSC_DATABASE = {
  SBIN0001234: {
    ifscCode: "SBIN0001234",
    bankName: "State Bank of India",
    branch: "Secunderabad Main",
    city: "Hyderabad",
  },
  HDFC0000001: {
    ifscCode: "HDFC0000001",
    bankName: "HDFC Bank",
    branch: "Banjara Hills",
    city: "Hyderabad",
  },
  ICIC0000002: {
    ifscCode: "ICIC0000002",
    bankName: "ICICI Bank",
    branch: "Hitech City",
    city: "Hyderabad",
  },
  UTIB0000123: {
    ifscCode: "UTIB0000123",
    bankName: "Axis Bank",
    branch: "Uppal",
    city: "Hyderabad",
  },
};

class BankProvider {
  constructor() {
    this.breaker = new CircuitBreaker("BankProvider");
  }

  async lookupIfsc(ifscCode) {
    return this.breaker.execute(
      async () => {
        const normalized = String(ifscCode).trim().toUpperCase();
        const record = IFSC_DATABASE[normalized];
        if (!record) {
          return null;
        }
        return record;
      },
      { isIdempotent: true }
    );
  }

  async verifyAccount(accountNumber, ifsc) {
    return this.breaker.execute(async () => {
      if (!/^\d{9,18}$/.test(accountNumber)) {
        return { valid: false, error: "INVALID_ACCOUNT_NUMBER" };
      }
      return {
        valid: true,
        registeredName: "Test Rider",
      };
    });
  }

  async verifyUpi(upiId) {
    return this.breaker.execute(async () => {
      const regex = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
      if (!regex.test(upiId)) {
        return { valid: false, error: "INVALID_UPI_ID" };
      }
      return {
        valid: true,
        registeredName: "Test Rider",
      };
    });
  }
}

// 5. Storage Provider (Local Disk)
class StorageProvider {
  constructor() {
    this.uploadDir = path.resolve(process.cwd(), ".data", "uploads");
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async put(storageKey, buffer, mimeType) {
    const filePath = path.join(this.uploadDir, storageKey);
    await fs.promises.writeFile(filePath, buffer);
    return { storageKey, sizeBytes: buffer.length, mimeType };
  }

  async get(storageKey) {
    const filePath = path.join(this.uploadDir, storageKey);
    if (!fs.existsSync(filePath)) {
      throw new AppError("FILE_NOT_FOUND", 404, "File not found on storage");
    }
    return fs.promises.readFile(filePath);
  }

  async delete(storageKey) {
    const filePath = path.join(this.uploadDir, storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    return { deleted: true };
  }

  signedUrl(storageKey, expiresInSeconds = 600) {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = crypto
      .createHmac("sha256", deliveryEnv.JWT_SECRET)
      .update(`${storageKey}:${expiresAt}`)
      .digest("hex");
    return `/api/v1/uploads/download/${encodeURIComponent(storageKey)}?expires=${expiresAt}&sig=${token}`;
  }

  verifySignedUrl(storageKey, expires, sig) {
    if (Number(expires) < Math.floor(Date.now() / 1000)) {
      return false;
    }
    const expected = crypto
      .createHmac("sha256", deliveryEnv.JWT_SECRET)
      .update(`${storageKey}:${expires}`)
      .digest("hex");
    return expected === sig;
  }
}

module.exports = {
  emailProvider: new EmailProvider(),
  kycProvider: new KycProvider(),
  faceMatchProvider: new FaceMatchProvider(),
  bankProvider: new BankProvider(),
  storageProvider: new StorageProvider(),
};
