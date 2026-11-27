const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const http = require("http");
const { PassThrough } = require("stream");
const express = require("express");
const mongoose = require("mongoose");

const mailer = require("../src/utils/mailer");
const { createDeliveryModule } = require("../src/modules/delivery");
const createAuthRoutes = require("../src/modules/auth/auth.routes");
const { errorHandler } = require("../src/middleware/error-handler");
const { deliveryEnv } = require("../src/modules/delivery/config/env");
const { hmacSha256, hashPassword } = require("../src/modules/delivery/lib/crypto");
const { emailProvider } = require("../src/modules/delivery/adapters");
const {
  forgotPasswordSchema,
  verifyOtpSchema,
  resendOtpSchema,
  resetPasswordSchema,
} = require("../src/modules/delivery/auth/auth.validation");
const authService = require("../src/modules/delivery/auth/auth.service");
const {
  RiderUser,
  RiderProfile,
  OtpSession,
  RefreshToken,
  PasswordResetToken,
  LoginAttempt,
  IdempotencyKey,
  AuditLog,
} = require("../src/modules/delivery/models");

function sha256(val) {
  return crypto.createHash("sha256").update(val).digest("hex");
}

/**
 * Invokes an Express app in-process without binding a network port.
 */
async function invokeApp(app, { method = "POST", url, body = null, headers = {} }) {
  const socket = new PassThrough();
  socket.remoteAddress = "127.0.0.1";

  const req = new http.IncomingMessage(socket);
  req.method = method.toUpperCase();
  req.url = url;

  const rawBody = body === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), "utf8");
  const normalizedHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    normalizedHeaders[k.toLowerCase()] = v;
  }
  if (body !== null && !normalizedHeaders["content-type"]) {
    normalizedHeaders["content-type"] = "application/json";
  }
  if (rawBody.length > 0 && !normalizedHeaders["content-length"]) {
    normalizedHeaders["content-length"] = String(rawBody.length);
  }
  req.headers = normalizedHeaders;

  const res = new http.ServerResponse(req);
  const chunks = [];
  res.write = (chunk) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };

  return new Promise((resolve, reject) => {
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      let parsedBody = text;
      try {
        parsedBody = text ? JSON.parse(text) : null;
      } catch {
        // leave text as-is
      }
      resolve({ status: res.statusCode, body: parsedBody });
    };

    app.handle(req, res, (err) => {
      if (err) reject(err);
    });

    if (rawBody.length > 0) req.push(rawBody);
    req.push(null);
  });
}

function createInMemoryAuthStore() {
  let seq = 1;
  const users = [];
  const profiles = [];
  const otpSessions = [];
  const resetTokens = [];
  const refreshTokens = [];
  const loginAttempts = [];
  const idempotencyKeys = [];
  const audits = [];

  const nextId = () => new mongoose.Types.ObjectId((seq++).toString(16).padStart(24, "0"));

  function wrapFindQuery(arr, predicate) {
    const matches = arr.filter(predicate);
    const sorted = [...matches];
    const chain = {
      sort(spec) {
        if (spec && spec.createdAt === -1) {
          sorted.sort((a, b) => b.createdAt - a.createdAt);
        }
        return chain;
      },
      select() {
        return Promise.resolve(sorted[0] || null);
      },
      lean() {
        return Promise.resolve(sorted[0] || null);
      },
      then(resolve, reject) {
        return Promise.resolve(sorted[0] || null).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    users,
    profiles,
    otpSessions,
    resetTokens,
    refreshTokens,
    loginAttempts,
    idempotencyKeys,
    audits,
    installStubs() {
      const originals = {
        userFindOne: RiderUser.findOne,
        userFindById: RiderUser.findById,
        userFindByIdAndUpdate: RiderUser.findByIdAndUpdate,
        profileFindOne: RiderProfile.findOne,
        otpFindOne: OtpSession.findOne,
        otpCreate: OtpSession.create,
        otpUpdateMany: OtpSession.updateMany,
        otpFindByIdAndUpdate: OtpSession.findByIdAndUpdate,
        resetFindOne: PasswordResetToken.findOne,
        resetCreate: PasswordResetToken.create,
        resetUpdateMany: PasswordResetToken.updateMany,
        resetFindOneAndUpdate: PasswordResetToken.findOneAndUpdate,
        refreshCreate: RefreshToken.create,
        refreshUpdateMany: RefreshToken.updateMany,
        attemptFindOne: LoginAttempt.findOne,
        attemptFindOneAndUpdate: LoginAttempt.findOneAndUpdate,
        idemFindOne: IdempotencyKey.findOne,
        idemCreate: IdempotencyKey.create,
        auditCreate: AuditLog.create,
        startSession: mongoose.startSession,
        sendOtp: emailProvider.sendOtp,
      };

      const sentEmails = [];

      RiderUser.findOne = (filter) =>
        wrapFindQuery(users, (u) => {
          if (filter.email && u.email !== filter.email) return false;
          if (filter._id && String(u._id) !== String(filter._id)) return false;
          return true;
        });

      RiderUser.findById = async (id) => users.find((u) => String(u._id) === String(id)) || null;

      RiderUser.findByIdAndUpdate = async (id, update) => {
        const user = users.find((u) => String(u._id) === String(id));
        if (!user) return null;
        Object.assign(user, update);
        return user;
      };

      RiderProfile.findOne = (filter) =>
        wrapFindQuery(profiles, (p) => (!filter.userId || String(p.userId) === String(filter.userId)));

      OtpSession.findOne = (filter) =>
        wrapFindQuery(otpSessions, (o) => {
          if (filter.userId && String(o.userId) !== String(filter.userId)) return false;
          if (filter.purpose && o.purpose !== filter.purpose) return false;
          if ("consumedAt" in filter && filter.consumedAt === null && o.consumedAt !== null) return false;
          if (filter.expiresAt?.$gt && !(o.expiresAt > filter.expiresAt.$gt)) return false;
          return true;
        });

      OtpSession.create = async (docOrDocs) => {
        const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
        const created = docs.map((d) => {
          const item = {
            _id: nextId(),
            attempts: 0,
            consumedAt: null,
            createdAt: new Date(Date.now() + seq),
            lastSentAt: new Date(),
            ...d,
          };
          otpSessions.push(item);
          return item;
        });
        return Array.isArray(docOrDocs) ? created : created[0];
      };

      OtpSession.updateMany = async (filter, update) => {
        for (const o of otpSessions) {
          if (filter.userId && String(o.userId) !== String(filter.userId)) continue;
          if (filter.purpose && o.purpose !== filter.purpose) continue;
          if ("consumedAt" in filter && filter.consumedAt === null && o.consumedAt !== null) continue;
          Object.assign(o, update.$set || update);
        }
      };

      OtpSession.findByIdAndUpdate = async (id, update) => {
        const o = otpSessions.find((item) => String(item._id) === String(id));
        if (!o) return null;
        if (update.$inc) {
          for (const [k, v] of Object.entries(update.$inc)) {
            o[k] = (o[k] || 0) + v;
          }
        }
        const rest = { ...update };
        delete rest.$inc;
        Object.assign(o, update.$set || rest);
        return o;
      };

      PasswordResetToken.findOne = async (filter) =>
        resetTokens.find((t) => !filter.tokenHash || t.tokenHash === filter.tokenHash) || null;

      PasswordResetToken.create = async (doc) => {
        const item = {
          _id: nextId(),
          usedAt: null,
          createdAt: new Date(),
          ...doc,
        };
        resetTokens.push(item);
        return item;
      };

      PasswordResetToken.updateMany = async (filter, update) => {
        for (const t of resetTokens) {
          if (filter.userId && String(t.userId) !== String(filter.userId)) continue;
          if ("usedAt" in filter && filter.usedAt === null && t.usedAt !== null) continue;
          Object.assign(t, update.$set || update);
        }
      };

      PasswordResetToken.findOneAndUpdate = async (filter, update) => {
        const token = resetTokens.find((t) => {
          if (filter._id && String(t._id) !== String(filter._id)) return false;
          if ("usedAt" in filter && filter.usedAt === null && t.usedAt !== null) return false;
          if (filter.expiresAt?.$gt && !(t.expiresAt > filter.expiresAt.$gt)) return false;
          return true;
        });
        if (!token) return null;
        Object.assign(token, update.$set || update);
        return token;
      };

      RefreshToken.create = async (doc) => {
        const item = { _id: nextId(), revokedAt: null, ...doc };
        refreshTokens.push(item);
        return item;
      };

      RefreshToken.updateMany = async (filter, update) => {
        for (const r of refreshTokens) {
          if (filter.userId && String(r.userId) !== String(filter.userId)) continue;
          if ("revokedAt" in filter && filter.revokedAt === null && r.revokedAt !== null) continue;
          Object.assign(r, update.$set || update);
        }
      };

      LoginAttempt.findOne = (filter) =>
        wrapFindQuery(loginAttempts, (a) => a.identifier === filter.identifier);

      LoginAttempt.findOneAndUpdate = async (filter, update, options = {}) => {
        let doc = loginAttempts.find((a) => a.identifier === filter.identifier);
        if (doc && filter.$or) {
          const matchesOr = filter.$or.some(
            (cond) =>
              ("lockedUntil" in cond && cond.lockedUntil === null && doc.lockedUntil === null) ||
              (cond.lockedUntil?.$lte && doc.lockedUntil && doc.lockedUntil <= cond.lockedUntil.$lte)
          );
          if (!matchesOr) return null;
        }
        if (!doc && !options.upsert) return null;
        if (!doc) {
          doc = { _id: nextId(), identifier: filter.identifier, failedTimestamps: [], lockedUntil: null };
          loginAttempts.push(doc);
        }
        if (Array.isArray(update)) {
          doc.failedTimestamps = [...(doc.failedTimestamps || []), new Date()];
          return doc;
        }
        Object.assign(doc, update.$set || update);
        return doc;
      };

      IdempotencyKey.findOne = (filter) =>
        wrapFindQuery(
          idempotencyKeys,
          (k) => k.key === filter.key && String(k.userId) === String(filter.userId)
        );

      IdempotencyKey.create = async (doc) => {
        idempotencyKeys.push(doc);
        return doc;
      };

      AuditLog.create = async (docOrDocs) => {
        const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
        audits.push(...docs);
        return docOrDocs;
      };

      mongoose.startSession = async () => ({
        withTransaction: async (fn) => fn(),
        endSession: async () => {},
      });

      emailProvider.sendOtp = async (email, code, options) => {
        sentEmails.push({ email, code, options });
        return { sent: true };
      };

      return {
        sentEmails,
        restore() {
          RiderUser.findOne = originals.userFindOne;
          RiderUser.findById = originals.userFindById;
          RiderUser.findByIdAndUpdate = originals.userFindByIdAndUpdate;
          RiderProfile.findOne = originals.profileFindOne;
          OtpSession.findOne = originals.otpFindOne;
          OtpSession.create = originals.otpCreate;
          OtpSession.updateMany = originals.otpUpdateMany;
          OtpSession.findByIdAndUpdate = originals.otpFindByIdAndUpdate;
          PasswordResetToken.findOne = originals.resetFindOne;
          PasswordResetToken.create = originals.resetCreate;
          PasswordResetToken.updateMany = originals.resetUpdateMany;
          PasswordResetToken.findOneAndUpdate = originals.resetFindOneAndUpdate;
          RefreshToken.create = originals.refreshCreate;
          RefreshToken.updateMany = originals.refreshUpdateMany;
          LoginAttempt.findOne = originals.attemptFindOne;
          LoginAttempt.findOneAndUpdate = originals.attemptFindOneAndUpdate;
          IdempotencyKey.findOne = originals.idemFindOne;
          IdempotencyKey.create = originals.idemCreate;
          AuditLog.create = originals.auditCreate;
          mongoose.startSession = originals.startSession;
          emailProvider.sendOtp = originals.sendOtp;
        },
      };
    },
  };
}

// ==========================================
// 1. Validation Schemas Tests
// ==========================================
test("Password Reset Validation: schemas validate forgot-password, otp flows, and reset-password", () => {
  assert.equal(forgotPasswordSchema.safeParse({ email: "  RIDER@Metkart.COM " }).data.email, "rider@metkart.com");
  assert.equal(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success, false);
  assert.equal(forgotPasswordSchema.safeParse({ email: "rider@metkart.com", extra: true }).success, false);

  assert.equal(verifyOtpSchema.safeParse({ email: "rider@metkart.com", otp: "123456" }).data.flow, "REGISTER");
  assert.equal(
    verifyOtpSchema.safeParse({ email: "rider@metkart.com", otp: "123456", flow: "FORGOT_PASSWORD" }).data.flow,
    "FORGOT_PASSWORD"
  );
  assert.equal(
    resendOtpSchema.safeParse({ email: "rider@metkart.com", flow: "FORGOT_PASSWORD" }).data.flow,
    "FORGOT_PASSWORD"
  );

  assert.equal(
    resetPasswordSchema.safeParse({
      email: "rider@metkart.com",
      resetToken: "abc123",
      newPassword: "NewPassword123",
      confirmPassword: "NewPassword123",
    }).success,
    true
  );

  assert.equal(
    resetPasswordSchema.safeParse({
      resetToken: "abc123",
      newPassword: "NewPassword123",
      confirmPassword: "NewPassword123",
    }).success,
    true
  );

  assert.equal(
    resetPasswordSchema.safeParse({
      resetToken: "abc123",
      newPassword: "NewPassword123",
      confirmPassword: "DifferentPassword",
    }).success,
    false
  );
  assert.equal(
    resetPasswordSchema.safeParse({
      resetToken: "abc123",
      newPassword: "123",
      confirmPassword: "123",
    }).success,
    false
  );
});

// ==========================================
// 2. Mailer Password Reset Template Test
// ==========================================
test("Mailer: sends password reset subject and copy when purpose is PASSWORD_RESET", async () => {
  const origSendMail = mailer.transporter.sendMail;
  const saved = {
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  };

  try {
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Metkart <user@example.com>";

    mailer.transporter.sendMail = async (opts) => {
      assert.equal(opts.subject, "Password Reset OTP - Metkart");
      assert.ok(opts.html.includes("Reset Your Password"));
      assert.ok(opts.html.includes("654321"));
      return { messageId: "reset-msg-1" };
    };

    const res = await mailer.sendOtpEmail("rider@example.com", "654321", "Rider", {
      purpose: "PASSWORD_RESET",
    });
    assert.deepEqual(res, { messageId: "reset-msg-1" });
  } finally {
    mailer.transporter.sendMail = origSendMail;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ==========================================
// 3. Service Flow & Security Guards
// ==========================================
test("Password Reset Service: masks unknown and inactive accounts without sending OTP", async () => {
  const store = createInMemoryAuthStore();
  const harness = store.installStubs();

  store.users.push({
    _id: new mongoose.Types.ObjectId("674500000000000000000099"),
    email: "suspended@metkart.com",
    passwordHash: "hash",
    role: "RIDER",
    status: "SUSPENDED",
  });

  try {
    const unknownRes = await authService.forgotPassword({ email: "unknown@metkart.com" });
    assert.equal(unknownRes.sent, true);
    assert.equal(unknownRes.resendAfterSeconds, deliveryEnv.OTP_RESEND_SECONDS);

    const suspendedRes = await authService.forgotPassword({ email: "suspended@metkart.com" });
    assert.equal(suspendedRes.sent, true);

    assert.equal(store.otpSessions.length, 0);
    assert.equal(harness.sentEmails.length, 0);

    const maskedResend = await authService.resendOtp({
      email: "unknown@metkart.com",
      flow: "FORGOT_PASSWORD",
    });
    assert.equal(maskedResend.sent, true);

    await assert.rejects(
      () => authService.resendOtp({ email: "unknown@metkart.com" }),
      (err) => err.code === "NOT_FOUND" && err.httpStatus === 404
    );
  } finally {
    harness.restore();
  }
});

test("Password Reset Service: purpose isolation, cooldown, OTP lockout, resetToken reuse guard, and refresh revocation", async () => {
  const store = createInMemoryAuthStore();
  const harness = store.installStubs();

  const userId = new mongoose.Types.ObjectId("674500000000000000000001");
  const oldPasswordHash = await hashPassword("OldPass@123", 4);
  store.users.push({
    _id: userId,
    email: "rider.reset@metkart.com",
    passwordHash: oldPasswordHash,
    role: "RIDER",
    emailVerifiedAt: new Date(),
    status: "ACTIVE",
  });
  store.refreshTokens.push({
    _id: new mongoose.Types.ObjectId("674500000000000000000002"),
    userId,
    familyId: "fam-1",
    tokenHash: sha256("active-refresh-token"),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
  });

  // Seed EMAIL_VERIFY OTP to verify purposes stay strictly isolated
  await OtpSession.create({
    userId,
    purpose: "EMAIL_VERIFY",
    codeHash: hmacSha256("999888", deliveryEnv.JWT_SECRET),
    expiresAt: new Date(Date.now() + 600000),
    lastSentAt: new Date(),
  });

  try {
    const forgotRes = await authService.forgotPassword({ email: "rider.reset@metkart.com" });
    assert.equal(forgotRes.sent, true);
    assert.equal(harness.sentEmails.length, 1);
    assert.equal(harness.sentEmails[0].options.purpose, "PASSWORD_RESET");
    const resetOtpCode = harness.sentEmails[0].code;

    // Immediate resend hits 429 cooldown
    await assert.rejects(
      () => authService.resendOtp({ email: "rider.reset@metkart.com", flow: "FORGOT_PASSWORD" }),
      (err) => err.code === "RATE_LIMITED" && err.httpStatus === 429
    );

    // Cannot verify EMAIL_VERIFY code under FORGOT_PASSWORD flow
    await assert.rejects(
      () => authService.verifyOtp({ email: "rider.reset@metkart.com", otp: "999888", flow: "FORGOT_PASSWORD" }),
      (err) => err.code === "OTP_INVALID" && err.httpStatus === 422
    );

    // Verify valid PASSWORD_RESET OTP -> receives single-use resetToken
    const verifyRes = await authService.verifyOtp({
      email: "rider.reset@metkart.com",
      otp: resetOtpCode,
      flow: "FORGOT_PASSWORD",
    });
    assert.equal(verifyRes.verified, true);
    assert.equal(verifyRes.flow, "FORGOT_PASSWORD");
    assert.ok(verifyRes.resetToken && verifyRes.resetToken.length >= 32);

    // Issuing a second reset token invalidates the first one
    store.otpSessions[store.otpSessions.length - 1].lastSentAt = new Date(Date.now() - 120000);
    const resendRes = await authService.resendOtp({
      email: "rider.reset@metkart.com",
      flow: "FORGOT_PASSWORD",
    });
    assert.equal(resendRes.sent, true);
    const verifyRes2 = await authService.verifyOtp({
      email: "rider.reset@metkart.com",
      otp: harness.sentEmails[1].code,
      flow: "FORGOT_PASSWORD",
    });

    await assert.rejects(
      () =>
        authService.resetPassword({
          email: "rider.reset@metkart.com",
          resetToken: verifyRes.resetToken,
          newPassword: "NewPass@2026",
        }),
      (err) => err.code === "RESET_TOKEN_INVALID" && err.httpStatus === 401
    );

    // Reject mismatched email without burning valid token
    await assert.rejects(
      () =>
        authService.resetPassword({
          email: "other@metkart.com",
          resetToken: verifyRes2.resetToken,
          newPassword: "NewPass@2026",
        }),
      (err) => err.code === "RESET_TOKEN_INVALID" && err.httpStatus === 401
    );

    // Reset password succeeds, revokes refresh tokens, marks token used
    const resetRes = await authService.resetPassword({
      email: "rider.reset@metkart.com",
      resetToken: verifyRes2.resetToken,
      newPassword: "NewPass@2026",
    });
    assert.equal(resetRes.reset, true);
    assert.ok(store.refreshTokens[0].revokedAt instanceof Date);

    // Reusing consumed token fails
    await assert.rejects(
      () =>
        authService.resetPassword({
          email: "rider.reset@metkart.com",
          resetToken: verifyRes2.resetToken,
          newPassword: "AnotherPass@2026",
        }),
      (err) => err.code === "RESET_TOKEN_INVALID" && err.httpStatus === 401
    );

    // Old password fails, new password logs in cleanly
    await assert.rejects(
      () => authService.loginRider({ email: "rider.reset@metkart.com", password: "OldPass@123" }),
      (err) => err.code === "INVALID_CREDENTIALS" && err.httpStatus === 401
    );

    const loginRes = await authService.loginRider({
      email: "rider.reset@metkart.com",
      password: "NewPass@2026",
    });
    assert.ok(loginRes.accessToken);
    assert.equal(loginRes.user.email, "rider.reset@metkart.com");

    const actions = store.audits.map((a) => a.action);
    assert.ok(actions.includes("PASSWORD_RESET_OTP_SENT"));
    assert.ok(actions.includes("PASSWORD_RESET_OTP_VERIFIED"));
    assert.ok(actions.includes("PASSWORD_RESET_COMPLETED"));
  } finally {
    harness.restore();
  }
});

test("Password Reset Service: enforces OTP attempt limit and expiration", async () => {
  const store = createInMemoryAuthStore();
  const harness = store.installStubs();

  const userId = new mongoose.Types.ObjectId("674500000000000000000022");
  store.users.push({
    _id: userId,
    email: "attempts.rider@metkart.com",
    passwordHash: await hashPassword("Pass@1234", 4),
    role: "RIDER",
    emailVerifiedAt: null,
    status: "ACTIVE",
  });

  try {
    await authService.forgotPassword({ email: "attempts.rider@metkart.com" });

    for (let i = 0; i < deliveryEnv.OTP_MAX_ATTEMPTS - 1; i += 1) {
      await assert.rejects(
        () => authService.verifyOtp({ email: "attempts.rider@metkart.com", otp: "000000", flow: "FORGOT_PASSWORD" }),
        (err) => err.code === "OTP_INVALID" && err.httpStatus === 422
      );
    }

    await assert.rejects(
      () => authService.verifyOtp({ email: "attempts.rider@metkart.com", otp: "000000", flow: "FORGOT_PASSWORD" }),
      (err) => err.code === "OTP_ATTEMPTS_EXCEEDED" && err.httpStatus === 429
    );

    // Expired OTP session fails cleanly
    store.otpSessions[0].attempts = 0;
    store.otpSessions[0].expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(
      () =>
        authService.verifyOtp({
          email: "attempts.rider@metkart.com",
          otp: harness.sentEmails[0].code,
          flow: "FORGOT_PASSWORD",
        }),
      (err) => err.code === "OTP_EXPIRED" && err.httpStatus === 422
    );
  } finally {
    harness.restore();
  }
});

// ==========================================
// 4. Express Route Integration Tests (/api/delivery, /api/rider, /api/v1/auth)
// ==========================================
test("Password Reset Routes: works across /api/delivery/auth, /api/rider/auth, and /api/v1/auth with validation and idempotency", async () => {
  const store = createInMemoryAuthStore();
  const harness = store.installStubs();

  const userId = new mongoose.Types.ObjectId("674500000000000000000010");
  store.users.push({
    _id: userId,
    email: "route.rider@metkart.com",
    passwordHash: await hashPassword("StartPass@1", 4),
    role: "RIDER",
    emailVerifiedAt: null,
    status: "ACTIVE",
  });

  const app = express();
  app.use(express.json());
  app.use("/api/delivery", createDeliveryModule());
  app.use("/api/rider", createDeliveryModule());
  app.use("/api/v1/auth", createAuthRoutes({ jwtSecret: "test-secret", jwtExpiresIn: "7d" }));
  app.use(errorHandler);

  try {
    // 1. Validation & NoSQL Sanitizer via /api/rider/auth/forgot-password
    const badForgot = await invokeApp(app, {
      url: "/api/rider/auth/forgot-password",
      body: { email: "bad-email" },
    });
    assert.equal(badForgot.status, 422);
    assert.equal(badForgot.body.success, false);
    assert.equal(badForgot.body.error.code, "VALIDATION_ERROR");

    const nosqlAttempt = await invokeApp(app, {
      url: "/api/delivery/auth/forgot-password",
      body: { email: { $ne: null } },
    });
    assert.equal(nosqlAttempt.status, 422);
    assert.equal(nosqlAttempt.body.error.code, "VALIDATION_ERROR");

    // 2. Send OTP via /api/delivery/auth/forgot-password with Idempotency-Key
    const forgotRes = await invokeApp(app, {
      url: "/api/delivery/auth/forgot-password",
      headers: { "Idempotency-Key": "forgot-idem-1" },
      body: { email: "route.rider@metkart.com" },
    });
    assert.equal(forgotRes.status, 200);
    assert.equal(forgotRes.body.success, true);
    assert.equal(forgotRes.body.data.sent, true);
    assert.equal(harness.sentEmails.length, 1);

    // Replay same Idempotency-Key does not trigger duplicate OTP or 429 cooldown
    const replayRes = await invokeApp(app, {
      url: "/api/delivery/auth/forgot-password",
      headers: { "Idempotency-Key": "forgot-idem-1" },
      body: { email: "route.rider@metkart.com" },
    });
    assert.equal(replayRes.status, 200);
    assert.equal(harness.sentEmails.length, 1);

    const otp = harness.sentEmails[0].code;

    // 3. Verify OTP via /api/rider/auth/otp/verify with flow FORGOT_PASSWORD
    const verifyRes = await invokeApp(app, {
      url: "/api/rider/auth/otp/verify",
      body: { email: "route.rider@metkart.com", otp, flow: "FORGOT_PASSWORD" },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.data.verified, true);
    const { resetToken } = verifyRes.body.data;
    assert.ok(resetToken);

    // 4. Mismatched confirmPassword rejected via /api/v1/auth/reset-password
    const mismatchRes = await invokeApp(app, {
      url: "/api/v1/auth/reset-password",
      body: {
        email: "route.rider@metkart.com",
        resetToken,
        newPassword: "UpdatedPass@99",
        confirmPassword: "WrongConfirm",
      },
    });
    assert.equal(mismatchRes.status, 422);
    assert.equal(mismatchRes.body.error.code, "VALIDATION_ERROR");

    // 5. Complete reset via /api/v1/auth/reset-password
    const resetRes = await invokeApp(app, {
      url: "/api/v1/auth/reset-password",
      body: {
        email: "route.rider@metkart.com",
        resetToken,
        newPassword: "UpdatedPass@99",
        confirmPassword: "UpdatedPass@99",
      },
    });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);
    assert.equal(resetRes.body.data.reset, true);
    assert.ok(store.users[0].emailVerifiedAt instanceof Date);
  } finally {
    harness.restore();
  }
});
