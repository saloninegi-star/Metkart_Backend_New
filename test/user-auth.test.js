const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const User = require("../src/modules/user/auth/user.model");
const mailer = require("../src/utils/mailer");

const JWT_SECRET = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";

function makeUserRecord(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439041",
    fullName: "Rahul Sharma",
    email: "rahul@example.com",
    mobileNumber: "+919876543210",
    currentAddress: "123 Market Street, Gurgaon",
    passwordHash: null,
    otp: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLockedUntil: null,
    isVerified: false,
    isEmailVerified: false,
    deletedAt: null,
    status: "active",
    ...overrides,
  };
}

test("user register validates fullName, email, mobileNumber, currentAddress, and password", async () => {
  const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

  const missingFields = await request(app)
    .post("/api/user/auth/register")
    .send({ email: "rahul@example.com", password: "Password@123" });
  assert.equal(missingFields.status, 400);
  assert.match(missingFields.body.message, /fullName.*mobileNumber.*currentAddress.*password/i);

  const badEmail = await request(app)
    .post("/api/user/auth/register")
    .send({
      fullName: "Rahul Sharma",
      email: "invalid-email",
      mobileNumber: "+919876543210",
      currentAddress: "Sector 15",
      password: "Password@123",
    });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.body.message, /valid email/i);

  const badPhone = await request(app)
    .post("/api/user/auth/register")
    .send({
      fullName: "Rahul Sharma",
      email: "rahul@example.com",
      mobileNumber: "abc",
      currentAddress: "Sector 15",
      password: "Password@123",
    });
  assert.equal(badPhone.status, 400);
  assert.match(badPhone.body.message, /valid mobileNumber/i);

  const shortPass = await request(app)
    .post("/api/user/auth/register")
    .send({
      fullName: "Rahul Sharma",
      email: "rahul@example.com",
      mobileNumber: "+919876543210",
      currentAddress: "Sector 15",
      password: "123",
    });
  assert.equal(shortPass.status, 400);
  assert.match(shortPass.body.message, /between 6 and 72/i);
});

test("complete user registration -> 3 wrong OTP 24h lock -> unlock after 24h -> verify OTP -> email+password login flow", async () => {
  const originalFindOne = User.findOne;
  const originalSave = User.prototype.save;
  const originalSendOtpEmail = mailer.sendOtpEmail;

  const store = new Map();
  const sentEmails = [];

  User.findOne = ({ email }) => {
    const doc = store.get(email) || null;
    return {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };
  User.prototype.save = async function saveStub() {
    store.set(this.email, this);
    return this;
  };
  mailer.sendOtpEmail = async (toEmail, otp, name) => {
    sentEmails.push({ toEmail, otp, name });
    return { messageId: "mock-user-msg-id" };
  };

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // 1. Register user with fullName, email, mobileNumber, currentAddress, password
    const regRes = await request(app)
      .post("/api/user/auth/register")
      .send({
        fullName: "  Rahul Sharma ",
        email: "  Rahul@Example.COM ",
        mobileNumber: " +919876543210 ",
        currentAddress: " 123 Market Street, Sector 15 ",
        password: "Password@123",
      });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.equal(regRes.body.dummyOtp, "123456");
    assert.equal(regRes.body.user.fullName, "Rahul Sharma");
    assert.equal(regRes.body.user.email, "rahul@example.com");
    assert.equal(regRes.body.user.mobileNumber, "+919876543210");
    assert.equal(regRes.body.user.currentAddress, "123 Market Street, Sector 15");
    assert.equal(regRes.body.user.isVerified, false);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].toEmail, "rahul@example.com");
    assert.equal(sentEmails[0].otp, "123456");

    const user = store.get("rahul@example.com");
    assert.ok(user.passwordHash);
    assert.equal(user.otp, "123456");

    // 2. Password login before OTP verification fails with 403
    const unverifiedLogin = await request(app)
      .post("/api/user/auth/login")
      .send({ email: "rahul@example.com", password: "Password@123" });
    assert.equal(unverifiedLogin.status, 403);
    assert.match(unverifiedLogin.body.message, /not verified/i);

    // 3. Wrong OTP 2 times + resend-otp does NOT reset otpAttempts + 3rd wrong locks for 24h
    const wrong1 = await request(app)
      .post("/api/user/auth/verify-otp")
      .send({ email: "rahul@example.com", otp: "000001" });
    assert.equal(wrong1.status, 400);
    assert.equal(wrong1.body.attemptsUsed, 1);
    assert.equal(wrong1.body.remainingAttempts, 2);

    const resendMid = await request(app)
      .post("/api/user/auth/resend-otp")
      .send({ email: "rahul@example.com" });
    assert.equal(resendMid.status, 200);
    assert.equal(resendMid.body.dummyOtp, "123456");
    assert.equal(user.otpAttempts, 1);

    const wrong2 = await request(app)
      .post("/api/user/auth/verify-otp")
      .send({ email: "rahul@example.com", otp: "000002" });
    assert.equal(wrong2.status, 400);
    assert.equal(wrong2.body.attemptsUsed, 2);
    assert.equal(wrong2.body.remainingAttempts, 1);

    const beforeLock = Date.now();
    const wrong3 = await request(app)
      .post("/api/user/auth/verify-otp")
      .send({ email: "rahul@example.com", otp: "000003" });
    assert.equal(wrong3.status, 429);
    assert.match(wrong3.body.message, /24 hours/i);
    assert.ok(user.otpLockedUntil instanceof Date);
    assert.ok(user.otpLockedUntil.getTime() - beforeLock >= 24 * 60 * 60 * 1000 - 5000);
    assert.equal(user.otp, null);

    // 4. While locked, verify-otp, send-otp, resend-otp, and register all return 429
    for (const [url, payload] of [
      ["/api/user/auth/verify-otp", { email: "rahul@example.com", otp: "123456" }],
      ["/api/user/auth/send-otp", { email: "rahul@example.com" }],
      ["/api/user/auth/resend-otp", { email: "rahul@example.com" }],
      [
        "/api/user/auth/register",
        {
          fullName: "Rahul Sharma",
          email: "rahul@example.com",
          mobileNumber: "+919876543210",
          currentAddress: "Sector 15",
          password: "Password@123",
        },
      ],
    ]) {
      const blockedRes = await request(app).post(url).send(payload);
      assert.equal(blockedRes.status, 429, url);
    }

    // 5. Simulate 24 hours elapsed -> send-otp unlocks and resets attempts -> verify-otp succeeds
    user.otpLockedUntil = new Date(Date.now() - 1000);
    const unlockedSend = await request(app)
      .post("/api/user/auth/send-otp")
      .send({ email: "rahul@example.com" });
    assert.equal(unlockedSend.status, 200);
    assert.equal(user.otpLockedUntil, null);
    assert.equal(user.otpAttempts, 0);
    assert.equal(user.otp, "123456");

    const verifyRes = await request(app)
      .post("/api/user/auth/verify-otp")
      .send({ email: "rahul@example.com", otp: "123456" });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.user.isVerified, true);
    assert.equal(verifyRes.body.user.isEmailVerified, true);
    assert.ok(verifyRes.body.token);
    assert.equal(user.isVerified, true);
    assert.equal(user.isEmailVerified, true);

    // 6. Duplicate registration returns 409
    const dupReg = await request(app)
      .post("/api/user/auth/register")
      .send({
        fullName: "Rahul Sharma",
        email: "rahul@example.com",
        mobileNumber: "+919876543210",
        currentAddress: "Sector 15",
        password: "Password@123",
      });
    assert.equal(dupReg.status, 409);
    assert.match(dupReg.body.message, /email and password/i);

    // 7. Login with wrong password fails with 401
    const wrongPass = await request(app)
      .post("/api/user/auth/login")
      .send({ email: "rahul@example.com", password: "WrongPassword" });
    assert.equal(wrongPass.status, 401);
    assert.match(wrongPass.body.message, /invalid email or password/i);

    // 8. Login with correct email & password succeeds with 30d JWT
    const loginRes = await request(app)
      .post("/api/user/auth/login")
      .send({ email: "RAHUL@EXAMPLE.COM", password: "Password@123" });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.equal(loginRes.body.message, "Login successful!");
    assert.equal(loginRes.body.user.email, "rahul@example.com");
    assert.equal(loginRes.body.user.fullName, "Rahul Sharma");
    assert.ok(loginRes.body.token);

    const decoded = jwt.verify(loginRes.body.token, JWT_SECRET);
    assert.equal(decoded.id, String(user._id));
    assert.equal(decoded.role, "user");
    assert.ok(decoded.exp - decoded.iat >= 29 * 86400);
  } finally {
    User.findOne = originalFindOne;
    User.prototype.save = originalSave;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});

test("user auth handles expired OTP, production dummyOtp hiding, SMTP failure fallback, and restricted accounts", async () => {
  const originalFindOne = User.findOne;
  const originalSave = User.prototype.save;
  const originalSendOtpEmail = mailer.sendOtpEmail;
  const originalNodeEnv = process.env.NODE_ENV;

  const expiredUser = makeUserRecord({
    _id: "507f1f77bcf86cd799439042",
    email: "expired@example.com",
    otp: "123456",
    otpExpiresAt: new Date(Date.now() - 60 * 1000),
  });
  const deletedUser = makeUserRecord({
    _id: "507f1f77bcf86cd799439043",
    email: "deleteduser@example.com",
    isVerified: true,
    passwordHash: await bcrypt.hash("Password@123", 10),
    deletedAt: new Date(),
  });
  const blockedUser = makeUserRecord({
    _id: "507f1f77bcf86cd799439044",
    email: "blockeduser@example.com",
    isVerified: true,
    passwordHash: await bcrypt.hash("Password@123", 10),
    status: "blocked",
  });

  const store = new Map([
    [expiredUser.email, expiredUser],
    [deletedUser.email, deletedUser],
    [blockedUser.email, blockedUser],
  ]);

  User.findOne = ({ email }) => {
    const doc = store.get(email) || null;
    return {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };
  User.prototype.save = async function saveStub() {
    store.set(this.email, this);
    return this;
  };
  mailer.sendOtpEmail = async () => {
    const err = new Error("535-5.7.8 Username and Password not accepted");
    err.code = "EAUTH";
    throw err;
  };

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // Expired OTP rejected
    const expRes = await request(app)
      .post("/api/user/auth/verify-otp")
      .send({ email: expiredUser.email, otp: "123456" });
    assert.equal(expRes.status, 400);
    assert.match(expRes.body.message, /expired/i);

    // Unregistered user on send-otp gets 404
    const notFoundSend = await request(app)
      .post("/api/user/auth/send-otp")
      .send({ email: "unknown@example.com" });
    assert.equal(notFoundSend.status, 404);

    // Deleted & blocked rejected on login and send-otp
    for (const email of [deletedUser.email, blockedUser.email]) {
      const loginFail = await request(app)
        .post("/api/user/auth/login")
        .send({ email, password: "Password@123" });
      assert.equal(loginFail.status, 403);

      const sendFail = await request(app)
        .post("/api/user/auth/send-otp")
        .send({ email });
      assert.equal(sendFail.status, 403);
    }

    // Registration succeeds even when SMTP throws EAUTH, and dummyOtp is hidden in production
    process.env.NODE_ENV = "production";
    const prodReg = await request(app)
      .post("/api/user/auth/register")
      .send({
        fullName: "Prod User",
        email: "prod@example.com",
        mobileNumber: "9876543210",
        currentAddress: "Delhi",
        password: "Password@123",
      });
    assert.equal(prodReg.status, 201);
    assert.equal(prodReg.body.success, true);
    assert.equal(Object.hasOwn(prodReg.body, "dummyOtp"), false);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    User.findOne = originalFindOne;
    User.prototype.save = originalSave;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});
