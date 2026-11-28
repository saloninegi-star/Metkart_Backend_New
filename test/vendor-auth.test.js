const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const vendorAuthController = require("../src/modules/vendor/auth/vendorAuth.controller");
const mailer = require("../src/utils/mailer");

const JWT_SECRET = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";

function makeVendorRecord(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    passwordHash: null,
    otp: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpLockedUntil: null,
    isEmailVerified: false,
    isProfileComplete: false,
    isProfileCompleted: false,
    onboardingStatus: "not_started",
    onboardingData: {},
    location: {},
    deletedAt: null,
    status: "active",
    ...overrides,
  };
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

test("new user Email OTP registration flow: sendOtp -> verifyOtpAndLogin (isNewUser: true) -> complete-registration", async () => {
  const originalFindOne = Vendor.findOne;
  const originalFindById = Vendor.findById;
  const originalSave = Vendor.prototype.save;
  const originalSendOtpEmail = mailer.sendOtpEmail;

  const storeByEmail = new Map();
  const storeById = new Map();
  const sentEmails = [];

  Vendor.findOne = ({ email }) => {
    const doc = storeByEmail.get(email) || null;
    return {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };
  Vendor.findById = async (id) => storeById.get(String(id)) || null;
  Vendor.prototype.save = async function saveStub() {
    storeByEmail.set(this.email, this);
    storeById.set(String(this._id), this);
    return this;
  };
  mailer.sendOtpEmail = async (toEmail, otp, name) => {
    sentEmails.push({ toEmail, otp, name });
    return { messageId: "mock-msg-id" };
  };

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // 1. New user calls sendOtp -> creates new Vendor record with required defaults
    const sendRes = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: "  FreshVendor@Example.COM " });

    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.body.success, true);
    assert.equal(sendRes.body.dummyOtp, "123456");
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].toEmail, "freshvendor@example.com");

    const created = storeByEmail.get("freshvendor@example.com");
    assert.ok(created);
    assert.equal(created.isEmailVerified, false);
    assert.equal(created.isProfileCompleted, false);
    assert.equal(created.otpAttempts, 0);
    assert.equal(created.otpLockedUntil, null);
    assert.equal(created.otp, "123456");

    // 2. Verify OTP -> returns isNewUser: true, isProfileCompleted: false, 30d JWT
    const verifyRes = await request(app)
      .post("/api/vendor/auth/verify-otp")
      .send({ email: "freshvendor@example.com", otp: "123456" });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.isNewUser, true);
    assert.equal(verifyRes.body.isProfileCompleted, false);
    assert.equal(verifyRes.body.message, "OTP verified. Please complete your registration.");
    assert.ok(verifyRes.body.token);
    assert.equal(verifyRes.body.vendor.isEmailVerified, true);
    assert.equal(verifyRes.body.vendor.isProfileCompleted, false);
    assert.equal(created.otp, null);
    assert.equal(created.otpAttempts, 0);

    const decoded = jwt.verify(verifyRes.body.token, JWT_SECRET);
    assert.equal(decoded.id, String(created._id));
    assert.equal(decoded.role, "vendor");
    assert.ok(decoded.exp - decoded.iat >= 29 * 86400);

    // 3. Complete registration via POST /vendor/complete-registration
    const completeRes = await request(app)
      .post("/vendor/complete-registration")
      .set("Authorization", `Bearer ${verifyRes.body.token}`)
      .send({
        ownerFullName: "Ramesh Kumar",
        mobileNumber: "+91 9876543210",
        roleType: "mechanic",
        location: { area: "Sector 18", city: "Noida", pincode: "201301" },
        mechanicDetails: { mechanicName: "Ramesh Auto Care" },
      });

    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.body.success, true);
    assert.equal(completeRes.body.message, "Registration completed successfully.");
    assert.equal(completeRes.body.vendor.isProfileCompleted, true);
    assert.equal(completeRes.body.vendor.ownerFullName, "Ramesh Kumar");
    assert.equal(completeRes.body.vendor.mobileNumber, "+91 9876543210");
    assert.equal(completeRes.body.vendor.roleType, "mechanic");
    assert.equal(created.isProfileCompleted, true);
    assert.equal(created.isProfileComplete, true);
    assert.equal(created.location.area, "Sector 18");
    assert.equal(created.mechanicDetails.mechanicName, "Ramesh Auto Care");
  } finally {
    Vendor.findOne = originalFindOne;
    Vendor.findById = originalFindById;
    Vendor.prototype.save = originalSave;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});

test("existing user login reuses record, prevents duplicates, and returns isNewUser: false (including legacy isProfileComplete)", async () => {
  const originalFindOne = Vendor.findOne;
  const originalSendOtpEmail = mailer.sendOtpEmail;

  let saveCount = 0;
  // Simulate a legacy registered vendor having only isProfileComplete: true
  const existingVendor = makeVendorRecord({
    email: "existing@example.com",
    isEmailVerified: true,
    isProfileComplete: true,
    isProfileCompleted: false,
    ownerFullName: "Existing Owner",
    fullName: "Existing Owner",
    roleType: "restaurant",
    async save() {
      saveCount += 1;
      return this;
    },
  });

  Vendor.findOne = ({ email }) => {
    const doc = email === existingVendor.email ? existingVendor : null;
    return {
      select: async () => doc,
      then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
    };
  };
  mailer.sendOtpEmail = async () => ({ messageId: "mock-id" });

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    const sendRes = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: "existing@example.com" });
    assert.equal(sendRes.status, 200);
    assert.equal(existingVendor.otp, "123456");

    const loginRes = await request(app)
      .post("/api/vendor/auth/verify-otp")
      .send({ email: "existing@example.com", otp: "123456" });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.equal(loginRes.body.isNewUser, false);
    assert.equal(loginRes.body.isProfileCompleted, true);
    assert.equal(loginRes.body.message, "Login successful!");
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.vendor.ownerFullName, "Existing Owner");
    assert.equal(existingVendor.isProfileCompleted, true);
    assert.equal(saveCount, 2);
  } finally {
    Vendor.findOne = originalFindOne;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});

test("3 wrong OTP attempts lock vendor for 24 hours across verify-otp, send-otp, and register, then unlock after 24 hours", async () => {
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

    // Calling resend-otp before attempt 3 must NOT reset otpAttempts
    const resendBefore3 = await request(app)
      .post("/api/vendor/auth/resend-otp")
      .send({ email: vendor.email });
    assert.equal(resendBefore3.status, 200);
    assert.equal(vendor.otpAttempts, 2);

    // Wrong attempt 3 -> locked for 24 hours
    const beforeLock = Date.now();
    const attempt3 = await request(app)
      .post("/api/vendor/auth/verify-otp")
      .send({ email: vendor.email, otp: "000003" });
    assert.equal(attempt3.status, 429);
    assert.match(attempt3.body.message, /24 hours/i);
    assert.ok(vendor.otpLockedUntil instanceof Date);
    const lockDurationMs = vendor.otpLockedUntil.getTime() - beforeLock;
    assert.ok(lockDurationMs >= 24 * 60 * 60 * 1000 - 5000);
    assert.equal(vendor.otp, null);

    // While locked, correct dummy OTP, send-otp, and re-register are all blocked with 429
    const blockedLogin = await request(app)
      .post("/api/vendor/auth/verify-otp")
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
      .post("/api/vendor/auth/verify-otp")
      .send({ email: vendor.email, otp: "123456" });
    assert.equal(unlockedLogin.status, 200);
    assert.ok(unlockedLogin.body.token);
    assert.equal(vendor.isEmailVerified, true);
  } finally {
    Vendor.findOne = originalFindOne;
    mailer.sendOtpEmail = originalSendOtpEmail;
  }
});

test("expired OTP is rejected cleanly", async () => {
  const originalFindOne = Vendor.findOne;
  const vendor = makeVendorRecord({
    otp: "123456",
    otpExpiresAt: new Date(Date.now() - 60 * 1000),
  });
  Vendor.findOne = async () => vendor;

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });
    const res = await request(app)
      .post("/api/vendor/auth/verify-otp")
      .send({ email: vendor.email, otp: "123456" });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /expired/i);
  } finally {
    Vendor.findOne = originalFindOne;
  }
});

test("complete-registration rejects incomplete/invalid payloads and duplicate registration attempts", async () => {
  const originalFindById = Vendor.findById;
  const vendor = makeVendorRecord({
    isEmailVerified: true,
    isProfileCompleted: false,
    isProfileComplete: false,
    async save() {
      return this;
    },
  });
  Vendor.findById = async () => vendor;

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // 1. Incomplete registration (missing required schema fields)
    const incompleteRes = await request(app)
      .post("/vendor/complete-registration")
      .set("Authorization", `Bearer ${token}`)
      .send({ ownerFullName: "Only Name" });

    assert.equal(incompleteRes.status, 400);
    assert.equal(incompleteRes.body.success, false);
    assert.ok(incompleteRes.body.errors.length >= 2);
    assert.equal(vendor.isProfileCompleted, false);

    // 2. Complete successfully
    const okRes = await request(app)
      .post("/api/vendor/auth/complete-registration")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Sunita Verma",
        mobileNumber: "9876543210",
        roleType: "shopkeeper",
        shopkeeperDetails: { shopkeeperName: "Verma Mart" },
      });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.vendor.isProfileCompleted, true);

    // 3. Duplicate registration attempt returns 409
    const dupRes = await request(app)
      .post("/vendor/complete-registration")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fullName: "Sunita Verma",
        mobileNumber: "9876543210",
        roleType: "shopkeeper",
      });
    assert.equal(dupRes.status, 409);
    assert.match(dupRes.body.message, /already completed/i);
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("deleted vendor accounts and unauthorized/unverified requests are rejected", async () => {
  const originalFindOne = Vendor.findOne;
  const originalFindById = Vendor.findById;

  const deletedVendor = makeVendorRecord({
    _id: "507f1f77bcf86cd799439021",
    email: "deleted@example.com",
    deletedAt: new Date(),
  });
  const unverifiedVendor = makeVendorRecord({
    _id: "507f1f77bcf86cd799439022",
    email: "unverified@example.com",
    isEmailVerified: false,
  });

  Vendor.findOne = async ({ email }) =>
    email === deletedVendor.email ? deletedVendor : null;
  Vendor.findById = async (id) => {
    if (String(id) === deletedVendor._id) return deletedVendor;
    if (String(id) === unverifiedVendor._id) return unverifiedVendor;
    return null;
  };

  try {
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    // Deleted vendor rejected on sendOtp and verifyOtp
    const delSend = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: deletedVendor.email });
    assert.equal(delSend.status, 403);

    const delVerify = await request(app)
      .post("/api/vendor/auth/verify-otp")
      .send({ email: deletedVendor.email, otp: "123456" });
    assert.equal(delVerify.status, 403);

    // Unauthorized complete-registration without token
    const noTokenRes = await request(app)
      .post("/vendor/complete-registration")
      .send({ ownerFullName: "Test", mobileNumber: "9876543210", roleType: "shopkeeper" });
    assert.equal(noTokenRes.status, 401);

    // Wrong role token rejected
    const userRoleToken = jwt.sign(
      { id: unverifiedVendor._id, email: unverifiedVendor.email, role: "user" },
      JWT_SECRET
    );
    const wrongRoleRes = await request(app)
      .post("/vendor/complete-registration")
      .set("Authorization", `Bearer ${userRoleToken}`)
      .send({ ownerFullName: "Test", mobileNumber: "9876543210", roleType: "shopkeeper" });
    assert.equal(wrongRoleRes.status, 403);

    // Deleted vendor token rejected on complete-registration
    const deletedToken = jwt.sign(
      { id: deletedVendor._id, email: deletedVendor.email, role: "vendor" },
      JWT_SECRET
    );
    const delCompleteRes = await request(app)
      .post("/vendor/complete-registration")
      .set("Authorization", `Bearer ${deletedToken}`)
      .send({ ownerFullName: "Test", mobileNumber: "9876543210", roleType: "shopkeeper" });
    assert.equal(delCompleteRes.status, 403);

    // Unverified vendor blocked by middleware AND controller guard
    const unverifiedToken = jwt.sign(
      { id: unverifiedVendor._id, email: unverifiedVendor.email, role: "vendor" },
      JWT_SECRET
    );
    const unverifiedRes = await request(app)
      .post("/vendor/complete-registration")
      .set("Authorization", `Bearer ${unverifiedToken}`)
      .send({ ownerFullName: "Test", mobileNumber: "9876543210", roleType: "shopkeeper" });
    assert.equal(unverifiedRes.status, 401);

    // Direct controller check for email verification guard
    const directRes = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await vendorAuthController.completeRegistration(
      {
        user: { id: unverifiedVendor._id },
        body: { ownerFullName: "Test", mobileNumber: "9876543210", roleType: "shopkeeper" },
      },
      directRes
    );
    assert.equal(directRes.statusCode, 403);
    assert.match(directRes.body.message, /verified/i);
  } finally {
    Vendor.findOne = originalFindOne;
    Vendor.findById = originalFindById;
  }
});

test("dummyOtp is not exposed in production and duplicate E11000 is handled safely", async () => {
  const originalFindOne = Vendor.findOne;
  const originalSave = Vendor.prototype.save;
  const originalSendOtpEmail = mailer.sendOtpEmail;
  const originalNodeEnv = process.env.NODE_ENV;

  let calls = 0;
  const existingDoc = makeVendorRecord({
    email: "race@example.com",
    async save() {
      return this;
    },
  });

  Vendor.findOne = async ({ email }) => {
    calls += 1;
    // First lookup misses (race), second lookup after E11000 returns created record
    if (calls === 1) return null;
    return email === existingDoc.email ? existingDoc : null;
  };
  Vendor.prototype.save = async function saveStub() {
    const dupErr = new Error("E11000 duplicate key error");
    dupErr.code = 11000;
    throw dupErr;
  };
  mailer.sendOtpEmail = async () => ({ messageId: "mock-id" });

  try {
    process.env.NODE_ENV = "production";
    const app = createApp({ jwtSecret: JWT_SECRET, corsOrigin: "*" });

    const res = await request(app)
      .post("/api/vendor/auth/send-otp")
      .send({ email: "race@example.com" });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(Object.hasOwn(res.body, "dummyOtp"), false);
    assert.equal(existingDoc.otp, "123456");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    Vendor.findOne = originalFindOne;
    Vendor.prototype.save = originalSave;
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
