const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const {
  getProfile,
  updateProfile,
  deleteProfile,
} = require("../src/modules/vendor/profile/profile.controller");

function responseRecorder() {
  return {
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
}

test("vendor profile routes require a bearer token", async () => {
  const app = createApp({
    jwtSecret: "test-secret-that-is-long-enough-for-this-test",
    corsOrigin: "*",
  });

  for (const method of ["get", "patch", "delete"]) {
    const response = await request(app)[method]("/api/vendor/profile");
    assert.equal(response.status, 401);
  }
});

test("soft-deleted vendors cannot use their existing bearer token", async () => {
  const originalFindById = Vendor.findById;
  const vendorId = "507f1f77bcf86cd799439011";
  Vendor.findById = async () => ({
    _id: vendorId,
    isEmailVerified: false,
    deletedAt: new Date(),
  });
  const secret = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";
  const token = jwt.sign(
    { id: vendorId, email: "vendor@example.com", role: "vendor" },
    secret
  );

  try {
    const response = await request(
      createApp({ jwtSecret: secret, corsOrigin: "*" })
    )
      .get("/api/vendor/profile")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.error.message, "Vendor profile has been deleted");
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("get profile returns safe profile fields and omits financial identifiers", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    isEmailVerified: true,
    isProfileComplete: true,
    onboardingType: "restaurant",
    onboardingStatus: "approved",
    onboardingReason: null,
    status: "active",
    onboardingData: {
      restaurantName: "Garden Bistro",
      ownerFullName: "Vendor Owner",
      panNumber: "ABCDE1234F",
      bankAccountNumber: "123456789",
      ifscCode: "SBIN0001234",
    },
    onboardingFiles: [],
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-02T00:00:00.000Z"),
  };
  const res = responseRecorder();

  await getProfile({ vendor }, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.vendorId, vendor._id);
  assert.equal(res.body.data.form.restaurantName, "Garden Bistro");
  assert.equal(Object.hasOwn(res.body.data.form, "panNumber"), false);
  assert.equal(Object.hasOwn(res.body.data.form, "bankAccountNumber"), false);
  assert.equal(Object.hasOwn(res.body.data.form, "ifscCode"), false);
});

test("update profile validates and merges editable fields", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    isEmailVerified: true,
    isProfileComplete: true,
    onboardingType: "restaurant",
    onboardingStatus: "approved",
    status: "active",
    onboardingData: {
      restaurantName: "Garden Bistro",
      ownerFullName: "Old Owner",
      panNumber: "ABCDE1234F",
      location: { area: "Old Area", city: "Pune" },
    },
    onboardingFiles: [],
    async save() {},
  };
  const res = responseRecorder();

  await updateProfile(
    {
      vendor,
      body: {
        ownerFullName: "New Owner",
        location: { area: "New Area" },
      },
    },
    res,
    (error) => {
      throw error;
    }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(vendor.onboardingData.ownerFullName, "New Owner");
  assert.deepEqual(vendor.onboardingData.location, {
    area: "New Area",
    city: "Pune",
  });
  assert.equal(vendor.onboardingData.panNumber, "ABCDE1234F");
  assert.equal(res.body.data.form.ownerFullName, "New Owner");
  assert.equal(Object.hasOwn(res.body.data.form, "panNumber"), false);
});

test("update profile rejects changes to protected fields", async () => {
  const res = responseRecorder();
  await updateProfile(
    {
      vendor: {
        onboardingType: "restaurant",
        onboardingData: {},
      },
      body: { status: "blocked" },
    },
    res,
    (error) => {
      res.statusCode = error.statusCode;
      res.body = { message: error.message };
    }
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Unsupported profile fields/);
});

test("delete profile soft-deletes and invalidates the vendor account", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    isEmailVerified: true,
    otp: "123456",
    otpExpiresAt: new Date(),
    async save() {},
  };
  const res = responseRecorder();

  await deleteProfile({ vendor }, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 200);
  assert.ok(vendor.deletedAt instanceof Date);
  assert.equal(vendor.isEmailVerified, false);
  assert.equal(vendor.otp, null);
  assert.equal(vendor.otpExpiresAt, null);
  assert.equal(res.body.data.vendorId, vendor._id);
});
