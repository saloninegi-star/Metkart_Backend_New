const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const mailer = require("../src/utils/mailer");

const JWT_SECRET = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";

function makeVendorRecord(overrides = {}) {
  const record = {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    passwordHash: null,
    otp: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLockedUntil: null,
    isEmailVerified: false,
    isProfileComplete: false,
    deletedAt: null,
    status: "active",
    ...overrides,
  };
  return record;
}

test("vendor register validates email and password", async () => {
  const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

  const badEmail = await request(app)
    .post("/api/vendor/auth/register")
    .send({ email: "not-an-email", password: "password123" });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.body.message, /valid email/i);

  const shortPass = await request(app)
    .post("/api/vendor/auth/register")
    .send({ email: "vendor@example.com", password: "123" });
  assert.equal(shortPass.status, 400);
  assert.match(shortPass.body.message, /between 6 and 72/i);
});

test("vendor registers with email and password, receives dummy OTP 123456 via email, and logs in with email and OTP", async () => {
  const originalFindOne = Vendor.findOne;
  const originalSave = Vendor.prototype.save;
  const originalSendOtpEmail = mailer.sendOtpEmail;

  const store = new Map();
  const sentEmails = [];

  Vendor.findOne = ({ email }) => {
    const doc = store.get(email) || null;
    const queryLike = {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
    return queryLike;
  };
  Vendor.prototype.save = async function saveStub() {
    store.set(this.email, this);
    return this;
  };
  mailer.sendOtpEmail = async (toEmail, otp, name) => {
    sentEmails.push({ toEmail, otp, name });
    return { messageId: "mock-msg-id" };
  };

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // 1. Register through email & password
    const registerRes = await request(app)
      .post("/api/vendor/auth/register")
      .send({ email: "NewVendor@Example.com", password: "Password@123" });

    assert.equal(registerRes.status, 201);
    assert.equal(registerRes.body.success, true);
    assert.equal(registerRes.body.dummyOtp, "123456");
    assert.equal(registerRes.body.vendor.email, "newvendor@example.com");
    assert.equal(registerRes.body.vendor.isEmailVerified, false);
    assert.equal(registerRes.body.vendor.passwordHash, undefined);

    // Email was sent with dummy OTP 123456
    assert.equal(sentEmails.length, 1);
    assert.deepEqual(sentEmails[0], {
      toEmail: "newvendor@example.com",
      otp: "123456",
      name: "Vendor",
    });

    // Password is hashed securely in DB
    const savedVendor = store.get("newvendor@example.com");
    assert.ok(savedVendor.passwordHash);
    assert.notEqual(savedVendor.passwordHash, "Password@123");
    assert.equal(await bcrypt.compare("Password@123", savedVendor.passwordHash), true);
    assert.equal(savedVendor.otp, "123456");

    // 2. Login with email & OTP
    const loginRes = await request(app)
      .post("/api/vendor/auth/login")
      .send({ email: "newvendor@example.com", otp: "123456" });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.vendor.isEmailVerified, true);

    const decoded = jwt.verify(loginRes.body.token, JWT_SECRET);
    assert.equal(decoded.email, "newvendor@example.com");
    assert.equal(decoded.role, "vendor");

    assert.equal(savedVendor.otp, null);
    assert.equal(savedVendor.otpAttempts, 0);

    // 3. Re-registering already verified vendor returns 409
    const duplicateRes = await request(app)
      .post("/api/vendor/auth/register")
      .send({ email: "newvendor@example.com", password: "Password@123" });
    assert.equal(duplicateRes.status, 409);

    // 4. Subsequent login can request OTP via send-otp and login with email + 123456
    const sendOtpRes = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: "newvendor@example.com" });
    assert.equal(sendOtpRes.status, 200);
    assert.equal(sendOtpRes.body.dummyOtp, "123456");
    assert.equal(sentEmails.length, 2);

    const reloginRes = await request(app)
      .post("/api/vendor/auth/login")
      .send({ email: "newvendor@example.com", otp: "123456" });
    assert.equal(reloginRes.status, 200);
    assert.ok(reloginRes.body.token);
  } finally {
    Vendor.findOne = originalFindOne;
    Vendor.prototype.save = originalSave;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});

test("send-otp rejects unregistered emails so vendors must register with email and password first", async () => {
  const originalFindOne = Vendor.findOne;
  Vendor.findOne = async () => null;

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });
    const res = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: "unknown@example.com" });

    assert.equal(res.status, 404);
    assert.match(res.body.message, /register/i);
  } finally {
    Vendor.findOne = originalFindOne;
  }
});

test("3 wrong OTP attempts lock vendor for 24 hours across login, verify-otp, send-otp, and register, then unlock after 24 hours", async () => {
  const originalFindOne = Vendor.findOne;
  const originalSendOtpEmail = mailer.sendOtpEmail;

  const vendor = makeVendorRecord({
    passwordHash: "hashed",
    otp: "123456",
    otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    isEmailVerified: false,
    async save() {
      return this;
    },
  });

  Vendor.findOne = ({ email }) => {
    const doc = email === vendor.email ? vendor : null;
    return {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };
  mailer.sendOtpEmail = async () => ({ messageId: "mock-id" });

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // Wrong attempt 1 -> 2 remaining
    const attempt1 = await request(app)
      .post("/api/vendor/auth/login")
      .send({ email: vendor.email, otp: "000001" });
    assert.equal(attempt1.status, 400);
    assert.equal(attempt1.body.attemptsUsed, 1);
    assert.equal(attempt1.body.remainingAttempts, 2);

    // Wrong attempt 2 -> 1 remaining
    const attempt2 = await request(app)
      .post("/api/vendor/auth/verify-otp")
      .send({ email: vendor.email, otp: "000002" });
    assert.equal(attempt2.status, 400);
    assert.equal(attempt2.body.attemptsUsed, 2);
    assert.equal(attempt2.body.remainingAttempts, 1);

    // Calling send-otp before attempt 3 must NOT reset otpAttempts
    const resendBefore3 = await request(app)
      .post("/api/vendor/auth/resend-otp")
      .send({ email: vendor.email });
    assert.equal(resendBefore3.status, 200);
    assert.equal(vendor.otpAttempts, 2);

    // Wrong attempt 3 -> locked for 24 hours
    const beforeLock = Date.now();
    const attempt3 = await request(app)
      .post("/api/vendor/auth/login")
      .send({ email: vendor.email, otp: "000003" });
    assert.equal(attempt3.status, 429);
    assert.match(attempt3.body.message, /24 hours/i);
    assert.ok(vendor.otpLockedUntil instanceof Date);
    const lockDurationMs = vendor.otpLockedUntil.getTime() - beforeLock;
    assert.ok(lockDurationMs >= 24 * 60 * 60 * 1000 - 5000);
    assert.equal(vendor.otp, null);

    // While locked, correct dummy OTP, send-otp, and re-register are all blocked with 429
    const blockedLogin = await request(app)
      .post("/api/vendor/auth/login")
      .send({ email: vendor.email, otp: "123456" });
    assert.equal(blockedLogin.status, 429);
    assert.match(blockedLogin.body.message, /24 hours/i);

    const blockedSendOtp = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: vendor.email });
    assert.equal(blockedSendOtp.status, 429);

    const blockedRegister = await request(app)
      .post("/api/vendor/auth/register")
      .send({ email: vendor.email, password: "Password@123" });
    assert.equal(blockedRegister.status, 429);

    // Simulate 24 hours elapsed
    vendor.otpLockedUntil = new Date(Date.now() - 1000);

    // Request fresh OTP after 24 hours unlocks and resets attempts
    const unlockedSendOtp = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: vendor.email });
    assert.equal(unlockedSendOtp.status, 200);
    assert.equal(vendor.otpLockedUntil, null);
    assert.equal(vendor.otpAttempts, 0);
    assert.equal(vendor.otp, "123456");

    // Login now succeeds with 123456
    const unlockedLogin = await request(app)
      .post("/api/vendor/auth/login")
      .send({ email: vendor.email, otp: "123456" });
    assert.equal(unlockedLogin.status, 200);
    assert.ok(unlockedLogin.body.token);
    assert.equal(vendor.isEmailVerified, true);
  } finally {
    Vendor.findOne = originalFindOne;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});

test("register and send-otp still succeed with dummy OTP 123456 if SMTP throws EAUTH", async () => {
  const originalFindOne = Vendor.findOne;
  const originalSave = Vendor.prototype.save;
  const originalSendOtpEmail = mailer.sendOtpEmail;

  const store = new Map();
  Vendor.findOne = ({ email }) => {
    const doc = store.get(email) || null;
    return {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };
  Vendor.prototype.save = async function saveStub() {
    store.set(this.email, this);
    return this;
  };
  mailer.sendOtpEmail = async () => {
    const err = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
    err.code = "EAUTH";
    throw err;
  };

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    const regRes = await request(app)
      .post("/api/vendor/auth/register")
      .send({ email: "smtpfail@example.com", password: "Password@123" });
    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.equal(regRes.body.dummyOtp, "123456");

    const resendRes = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: "smtpfail@example.com" });
    assert.equal(resendRes.status, 200);
    assert.equal(resendRes.body.dummyOtp, "123456");
  } finally {
    Vendor.findOne = originalFindOne;
    Vendor.prototype.save = originalSave;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});
