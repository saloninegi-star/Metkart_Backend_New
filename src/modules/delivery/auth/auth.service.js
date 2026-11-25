const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const {
  RiderUser,
  RiderProfile,
  OtpSession,
  RefreshToken,
} = require("../models");
const AppError = require("../lib/AppError");
const {
  hashPassword,
  comparePassword,
  hmacSha256,
  constantTimeCompare,
} = require("../lib/crypto");
const { emailProvider } = require("../adapters");
const { deliveryEnv } = require("../config/env");
const { recordAudit } = require("../lib/audit");

const ALL_STEPS = [
  "RIDE_TYPE",
  "PREFERENCE",
  "WORK_AREA",
  "VEHICLE",
  "IDENTITY",
  "SELFIE",
  "KIT_NOMINEE",
  "BANK",
];

function determineCurrentStep(completedSteps = []) {
  for (const step of ALL_STEPS) {
    if (!completedSteps.includes(step)) {
      return step;
    }
  }
  return "COMPLETED";
}

function generateOtp() {
  // If SMTP credentials or Brevo fallback API key are configured, generate a real random 6-digit OTP
  if ((process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.BREVO_API_KEY) {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  if (deliveryEnv.PROVIDER_MODE === "mock") {
    return "123456";
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id ? user._id.toString() : user.id,
      email: user.email,
      role: user.role,
    },
    deliveryEnv.JWT_SECRET,
    { expiresIn: deliveryEnv.JWT_ACCESS_TTL }
  );
}

async function createRefreshToken(userId, familyId = null) {
  const tokenRaw = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");
  const famId = familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + deliveryEnv.REFRESH_TTL_DAYS * 86400 * 1000);

  await RefreshToken.create({
    userId,
    familyId: famId,
    tokenHash,
    expiresAt,
  });

  return tokenRaw;
}

async function registerRider({ email, password, role, phone }) {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check if user already exists
  const existingUser = await RiderUser.findOne({ email: normalizedEmail });
  if (existingUser) {
    if (existingUser.emailVerifiedAt) {
      throw new AppError("EMAIL_ALREADY_REGISTERED", 409, "An account with this email already exists");
    }

    // Unverified user: resend OTP and return 200
    const activeOtp = await OtpSession.findOne({
      userId: existingUser._id,
      purpose: "EMAIL_VERIFY",
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (activeOtp && Date.now() - activeOtp.lastSentAt.getTime() < deliveryEnv.OTP_RESEND_SECONDS * 1000) {
      const waitTime = Math.ceil((deliveryEnv.OTP_RESEND_SECONDS * 1000 - (Date.now() - activeOtp.lastSentAt.getTime())) / 1000);
      throw new AppError("RATE_LIMITED", 429, `Please wait ${waitTime}s before requesting a new OTP`, {
        retryAfterSeconds: waitTime,
      });
    }

    const otp = generateOtp();
    const codeHash = hmacSha256(otp, deliveryEnv.JWT_SECRET);
    const expiresAt = new Date(Date.now() + deliveryEnv.OTP_EXPIRY_SECONDS * 1000);

    await OtpSession.updateMany(
      { userId: existingUser._id, purpose: "EMAIL_VERIFY", consumedAt: null },
      { consumedAt: new Date() }
    );

    await OtpSession.create({
      userId: existingUser._id,
      purpose: "EMAIL_VERIFY",
      codeHash,
      expiresAt,
      lastSentAt: new Date(),
    });

    await emailProvider.sendOtp(normalizedEmail, otp);

    return {
      isResend: true,
      userId: existingUser._id.toString(),
      email: normalizedEmail,
      resendAfterSeconds: deliveryEnv.OTP_RESEND_SECONDS,
      expiresInSeconds: deliveryEnv.OTP_EXPIRY_SECONDS,
    };
  }

  // Check phone uniqueness if provided
  if (phone) {
    const existingPhone = await RiderUser.findOne({ phone });
    if (existingPhone) {
      throw new AppError("PHONE_ALREADY_USED", 409, "This phone number is already registered to another rider");
    }
  }

  // 2. New registration using MongoDB transaction
  const session = await mongoose.startSession();
  let createdUser;
  const otp = generateOtp();

  try {
    await session.withTransaction(async () => {
      const passwordHashed = await hashPassword(password);

      const users = await RiderUser.create(
        [
          {
            email: normalizedEmail,
            phone: phone || null,
            passwordHash: passwordHashed,
            role,
            emailVerifiedAt: null,
            status: "ACTIVE",
          },
        ],
        { session }
      );
      createdUser = users[0];

      await RiderProfile.create(
        [
          {
            userId: createdUser._id,
            status: "IN_PROGRESS",
            completedSteps: [],
          },
        ],
        { session }
      );

      const codeHash = hmacSha256(otp, deliveryEnv.JWT_SECRET);
      const expiresAt = new Date(Date.now() + deliveryEnv.OTP_EXPIRY_SECONDS * 1000);

      await OtpSession.create(
        [
          {
            userId: createdUser._id,
            purpose: "EMAIL_VERIFY",
            codeHash,
            expiresAt,
            lastSentAt: new Date(),
          },
        ],
        { session }
      );
    });
  } catch (err) {
    await session.endSession();
    if (err.code === 11000) {
      throw new AppError("EMAIL_ALREADY_REGISTERED", 409, "An account with this email already exists");
    }
    throw err;
  }
  await session.endSession();

  // Send OTP after transaction commits
  await emailProvider.sendOtp(normalizedEmail, otp);
  await recordAudit({
    actorUserId: createdUser._id,
    action: "RIDER_REGISTERED",
    entity: "users",
    entityId: createdUser._id,
  });

  return {
    isResend: false,
    userId: createdUser._id.toString(),
    email: normalizedEmail,
    resendAfterSeconds: deliveryEnv.OTP_RESEND_SECONDS,
    expiresInSeconds: deliveryEnv.OTP_EXPIRY_SECONDS,
  };
}

async function verifyOtp({ email, otp }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await RiderUser.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError("UNAUTHENTICATED", 401, "Invalid email or OTP");
  }

  const otpSession = await OtpSession.findOne({
    userId: user._id,
    purpose: "EMAIL_VERIFY",
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!otpSession) {
    throw new AppError("OTP_EXPIRED", 422, "No active OTP found. Please request a new code.");
  }

  if (otpSession.expiresAt < new Date()) {
    throw new AppError("OTP_EXPIRED", 422, "Verification code has expired");
  }

  if (otpSession.attempts >= deliveryEnv.OTP_MAX_ATTEMPTS) {
    throw new AppError(
      "OTP_ATTEMPTS_EXCEEDED",
      429,
      "Maximum verification attempts exceeded. Please request a new code."
    );
  }

  // Verify OTP
  const expectedHash = hmacSha256(otp, deliveryEnv.JWT_SECRET);
  const isMock = deliveryEnv.PROVIDER_MODE === "mock" && otp === "123456";
  const isValid = isMock || constantTimeCompare(otpSession.codeHash, expectedHash);

  if (!isValid) {
    const updated = await OtpSession.findByIdAndUpdate(
      otpSession._id,
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (updated.attempts >= deliveryEnv.OTP_MAX_ATTEMPTS) {
      throw new AppError(
        "OTP_ATTEMPTS_EXCEEDED",
        429,
        "Maximum verification attempts exceeded. Please request a new code."
      );
    }
    throw new AppError("OTP_INVALID", 422, "Invalid verification code");
  }

  // Mark consumed and verify email
  await OtpSession.findByIdAndUpdate(otpSession._id, { consumedAt: new Date() });
  await RiderUser.findByIdAndUpdate(user._id, { emailVerifiedAt: new Date() });

  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user._id);

  const profile = await RiderProfile.findOne({ userId: user._id }).lean();
  const currentStep = determineCurrentStep(profile?.completedSteps || []);

  await recordAudit({
    actorUserId: user._id,
    action: "EMAIL_VERIFIED",
    entity: "users",
    entityId: user._id,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    onboarding: {
      status: profile?.status || "IN_PROGRESS",
      currentStep,
    },
  };
}

async function resendOtp({ email }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await RiderUser.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError("NOT_FOUND", 404, "User not found with this email");
  }

  const lastSession = await OtpSession.findOne({
    userId: user._id,
    purpose: "EMAIL_VERIFY",
  }).sort({ createdAt: -1 });

  if (lastSession && Date.now() - lastSession.lastSentAt.getTime() < deliveryEnv.OTP_RESEND_SECONDS * 1000) {
    const remainingSeconds = Math.ceil(
      (deliveryEnv.OTP_RESEND_SECONDS * 1000 - (Date.now() - lastSession.lastSentAt.getTime())) / 1000
    );
    throw new AppError(
      "RATE_LIMITED",
      429,
      `Please wait ${remainingSeconds} seconds before requesting a new OTP`,
      { retryAfterSeconds: remainingSeconds }
    );
  }

  await OtpSession.updateMany(
    { userId: user._id, purpose: "EMAIL_VERIFY", consumedAt: null },
    { consumedAt: new Date() }
  );

  const otp = generateOtp();
  const codeHash = hmacSha256(otp, deliveryEnv.JWT_SECRET);
  const expiresAt = new Date(Date.now() + deliveryEnv.OTP_EXPIRY_SECONDS * 1000);

  await OtpSession.create({
    userId: user._id,
    purpose: "EMAIL_VERIFY",
    codeHash,
    expiresAt,
    lastSentAt: new Date(),
  });

  await emailProvider.sendOtp(normalizedEmail, otp);

  return {
    sent: true,
    resendAfterSeconds: deliveryEnv.OTP_RESEND_SECONDS,
    expiresInSeconds: deliveryEnv.OTP_EXPIRY_SECONDS,
  };
}

async function loginRider({ email, password }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await RiderUser.findOne({ email: normalizedEmail }).select("+passwordHash");

  if (!user) {
    // Run dummy compare to thwart timing attacks
    await comparePassword(password, null);
    throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password");
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password");
  }

  if (!user.emailVerifiedAt) {
    throw new AppError("EMAIL_NOT_VERIFIED", 403, "Please verify your email address before logging in");
  }

  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user._id);

  const profile = await RiderProfile.findOne({ userId: user._id }).lean();
  const currentStep = determineCurrentStep(profile?.completedSteps || []);

  await recordAudit({
    actorUserId: user._id,
    action: "RIDER_LOGIN",
    entity: "users",
    entityId: user._id,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    onboarding: {
      status: profile?.status || "IN_PROGRESS",
      currentStep,
    },
  };
}

async function refreshTokens(rawToken) {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const storedToken = await RefreshToken.findOne({ tokenHash });

  if (!storedToken) {
    throw new AppError("UNAUTHENTICATED", 401, "Invalid refresh token");
  }

  if (storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    // Token reuse detected! Revoke all tokens in family
    await RefreshToken.updateMany(
      { familyId: storedToken.familyId },
      { revokedAt: new Date() }
    );
    throw new AppError("UNAUTHENTICATED", 401, "Refresh token family revoked due to reuse or expiration");
  }

  const user = await RiderUser.findById(storedToken.userId);
  if (!user || user.status !== "ACTIVE") {
    throw new AppError("UNAUTHENTICATED", 401, "User no longer active");
  }

  // Rotate token: revoke current and replace with new
  const newRawToken = crypto.randomBytes(32).toString("hex");
  const newTokenHash = crypto.createHash("sha256").update(newRawToken).digest("hex");
  const newExpiresAt = new Date(Date.now() + deliveryEnv.REFRESH_TTL_DAYS * 86400 * 1000);

  await RefreshToken.findByIdAndUpdate(storedToken._id, {
    revokedAt: new Date(),
    replacedBy: newTokenHash,
  });

  await RefreshToken.create({
    userId: user._id,
    familyId: storedToken.familyId,
    tokenHash: newTokenHash,
    expiresAt: newExpiresAt,
  });

  const accessToken = createAccessToken(user);

  return {
    accessToken,
    refreshToken: newRawToken,
  };
}

async function updateContact(userId, phone) {
  const existing = await RiderUser.findOne({ phone, _id: { $ne: userId } });
  if (existing) {
    throw new AppError("PHONE_ALREADY_USED", 409, "This phone number is already registered to another rider");
  }

  await RiderUser.findByIdAndUpdate(userId, { phone });

  await recordAudit({
    actorUserId: userId,
    action: "CONTACT_UPDATED",
    entity: "users",
    entityId: userId,
  });
}

module.exports = {
  determineCurrentStep,
  registerRider,
  verifyOtp,
  resendOtp,
  loginRider,
  refreshTokens,
  updateContact,
};
