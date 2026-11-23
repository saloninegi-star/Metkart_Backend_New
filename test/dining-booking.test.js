const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const User = require("../src/modules/user/auth/user.model");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const DiningBooking = require("../src/modules/user/food/dinning/dining.model");

const secret = "test-secret-that-is-long-enough-for-this-test";
const app = createApp({
  jwtSecret: secret,
  corsOrigin: "*",
});

function makeToken(user, role = "user") {
  return jwt.sign(
    { id: String(user._id), email: user.email, role },
    secret,
    { expiresIn: "1h" }
  );
}

test("dining reservation creation requires a user bearer token", async () => {
  const response = await request(app).post("/api/user/food/dining").send({});
  assert.equal(response.status, 401);
});

test("dining reservation creation rejects a vendor token", async () => {
  const vendorToken = jwt.sign(
    { id: "507f1f77bcf86cd799439011", email: "vendor@example.com", role: "vendor" },
    secret,
    { expiresIn: "1h" }
  );
  const response = await request(app)
    .post("/api/user/food/dining")
    .set("Authorization", `Bearer ${vendorToken}`)
    .send({ restaurant_id: "507f1f77bcf86cd799439012" });

  assert.equal(response.status, 403);
});

test("dining reservation creation rejects missing or invalid restaurant_id", async () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    email: "user@example.com",
    fullName: "Jane Doe",
    mobileNumber: "9876543210",
    isVerified: true,
  };
  const originalFindById = User.findById;
  User.findById = async () => user;

  try {
    const token = makeToken(user);
    const response = await request(app)
      .post("/api/user/food/dining")
      .set("Authorization", `Bearer ${token}`)
      .send({
        numberOfGuests: 3,
        reservationDate: "2026-10-24",
        timeSlot: "8:00 PM",
      });

    assert.equal(response.status, 400);
    assert.ok(response.body.error.message.includes("restaurant_id"));
  } finally {
    User.findById = originalFindById;
  }
});

test("verified user can create a dining reservation with Figma fields and grand total", async () => {
  const userId = "507f1f77bcf86cd799439011";
  const restaurantId = "507f1f77bcf86cd799439012";

  const user = {
    _id: userId,
    email: "user@example.com",
    fullName: "Jane Doe",
    mobileNumber: "9876543210",
    currentAddress: "Sector 4, Noida",
    isVerified: true,
  };

  const restaurantVendor = {
    _id: restaurantId,
    email: "bistro@example.com",
    onboardingType: "restaurant",
    onboardingData: {
      restaurantName: "The Grand Heritage Bistro",
      location: {
        area: "Gyan Vihar, Sector 4",
        city: "Noida",
      },
      mobileNumber: "9812345678",
    },
  };

  const originalUserFindById = User.findById;
  const originalVendorFindById = Vendor.findById;
  const originalDiningCreate = DiningBooking.create;

  User.findById = async (id) => (String(id) === userId ? user : null);
  Vendor.findById = async (id) => (String(id) === restaurantId ? restaurantVendor : null);

  let createdDoc = null;
  DiningBooking.create = async (payload) => {
    createdDoc = {
      ...payload,
      _id: "507f1f77bcf86cd799439099",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return createdDoc;
  };

  try {
    const token = makeToken(user);
    const bookingPayload = {
      restaurant_id: restaurantId,
      numberOfGuests: 3,
      reservationDate: "Today, 24 Oct",
      timeSlot: "8:00 PM",
      seatingArea: "Indoor Courtyard",
      specialRequests: "Anniversary table by the fountain",
      specialRequestTags: ["Anniversary", "Window Seat"],
      total: 1260,
    };

    const response = await request(app)
      .post("/api/user/food/dining")
      .set("Authorization", `Bearer ${token}`)
      .send(bookingPayload);

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data._id, "507f1f77bcf86cd799439099");
    assert.equal(response.body.data.id, undefined);
    assert.equal(response.body.data.numberOfGuests, 3);
    assert.equal(response.body.data.reservationDate, "Today, 24 Oct");
    assert.equal(response.body.data.timeSlot, "8:00 PM");
    assert.equal(response.body.data.seatingArea, "Indoor Courtyard");
    assert.equal(response.body.data.total, undefined);
    assert.equal(response.body.data.grandTotal, 1260);
    assert.equal(response.body.data.restaurantId._id, restaurantId);
    assert.equal(response.body.data.restaurantId.restaurantName, "The Grand Heritage Bistro");
  } finally {
    User.findById = originalUserFindById;
    Vendor.findById = originalVendorFindById;
    DiningBooking.create = originalDiningCreate;
  }
});

test("user can get dining reservations without authentication", async () => {
  const userId = "507f1f77bcf86cd799439011";
  const sampleBookings = [
    {
      _id: "507f1f77bcf86cd799439099",
      userId,
      restaurantName: "The Grand Heritage Bistro",
      numberOfGuests: 3,
      reservationDate: "Today, 24 Oct",
      timeSlot: "8:00 PM",
      grandTotal: 1260,
      status: "confirmed",
    },
  ];

  const originalDiningFind = DiningBooking.find;

  DiningBooking.find = () => ({
    select: () => ({
      populate: () => ({
        populate: () => ({
          sort: async () => sampleBookings,
        }),
      }),
    }),
  });

  try {
    const response = await request(app).get("/api/user/food/dining");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.data[0].restaurantName, "The Grand Heritage Bistro");
    assert.equal(response.body.data[0].grandTotal, 1260);
  } finally {
    DiningBooking.find = originalDiningFind;
  }
});

test("both /api/user/food/dining and /api/user/food/dinning route endpoints work without auth", async () => {
  const originalDiningFind = DiningBooking.find;

  DiningBooking.find = () => ({
    select: () => ({
      populate: () => ({
        populate: () => ({
          sort: async () => [],
        }),
      }),
    }),
  });

  try {
    const res1 = await request(app).get("/api/user/food/dining");
    const res2 = await request(app).get("/api/user/food/dinning");

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
  } finally {
    DiningBooking.find = originalDiningFind;
  }
});
