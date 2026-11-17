const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");

test("vendor dashboard requires a bearer token", async () => {
  const response = await request(
    createApp({
      jwtSecret: "test-secret-that-is-long-enough-for-this-test",
      corsOrigin: "*",
    })
  ).get("/api/vendor/dashboard");

  assert.equal(response.status, 401);
});

test("vendor dashboard returns Figma sections with empty metrics until data sources exist", async () => {
  const originalFindById = Vendor.findById;
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    isEmailVerified: true,
    onboardingType: "restaurant",
    onboardingStatus: "approved",
    onboardingData: {
      ownerFullName: "Aman",
      restaurantName: "Garden Bistro",
    },
    status: "active",
  };
  Vendor.findById = async (id) => {
    assert.equal(id, vendor._id);
    return vendor;
  };

  try {
    const secret = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      secret
    );
    const response = await request(
      createApp({ jwtSecret: secret, corsOrigin: "*" })
    )
      .get("/api/vendor/dashboard")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.vendor, {
      vendorId: vendor._id,
      name: "Aman",
      businessName: "Garden Bistro",
      type: "restaurant",
      isVerified: true,
      availabilityStatus: null,
    });
    assert.deepEqual(response.body.data.metrics, {
      todaysOrders: { count: 0 },
      pendingOrders: { count: 0 },
      earnings: { amount: 0, currency: "INR", monthlyChangePercent: 0 },
      wallet: { balance: 0, currency: "INR", leaderboardRank: null },
    });
    assert.deepEqual(response.body.data.recentActivity, []);
    assert.deepEqual(response.body.data.notifications, []);
    assert.deepEqual(response.body.data.ecoImpact, {
      carbonOffsetKg: 0,
      ecoPointsEarned: 0,
    });
    assert.equal(response.body.data.achievement.completed, 0);
    assert.equal(response.body.data.achievement.target, 20);
    assert.equal(response.body.data.vendorHub.length, 3);
    assert.equal(response.body.data.campaign.title, "Summer Organic Drive");
  } finally {
    Vendor.findById = originalFindById;
  }
});
