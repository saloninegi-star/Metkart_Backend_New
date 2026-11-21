const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const Menu = require("../src/modules/user/food/menu/menu.model");

const secret = "test-secret-that-is-long-enough-for-this-test";
const app = createApp({
  jwtSecret: secret,
  corsOrigin: "*",
});

function makeVendorToken(vendor) {
  return jwt.sign(
    { id: String(vendor._id), email: vendor.email, role: "vendor" },
    secret,
    { expiresIn: "1h" }
  );
}

test("menu creation requires a vendor bearer token", async () => {
  const response = await request(app).post("/api/user/food/menu").send({});
  assert.equal(response.status, 401);
});

test("menu creation rejects a user token", async () => {
  const userToken = jwt.sign(
    { id: "507f1f77bcf86cd799439011", email: "user@example.com", role: "user" },
    secret,
    { expiresIn: "1h" }
  );
  const response = await request(app)
    .post("/api/user/food/menu")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ restaurant_id: "507f1f77bcf86cd799439012" });

  assert.equal(response.status, 403);
});

test("menu creation rejects when restaurant not found", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "chef@example.com",
    isEmailVerified: true,
    status: "active",
    onboardingStatus: "approved",
  };

  const originalVendorFindById = Vendor.findById;
  Vendor.findById = async (id) => {
    if (String(id) === "507f1f77bcf86cd799439011") return vendor;
    return null;
  };

  try {
    const token = makeVendorToken(vendor);
    const response = await request(app)
      .post("/api/user/food/menu")
      .set("Authorization", `Bearer ${token}`)
      .send({
        restaurant_id: "507f1f77bcf86cd799439099", // Non-existent ID
        products: JSON.stringify([{ dishName: "Butter Chicken", price: 350 }]),
      });

    assert.equal(response.status, 404);
  } finally {
    Vendor.findById = originalVendorFindById;
  }
});

test("menu creation rejects empty products array", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "chef@example.com",
    isEmailVerified: true,
    status: "active",
    onboardingStatus: "approved",
  };

  const originalVendorFindById = Vendor.findById;
  Vendor.findById = async () => vendor;

  try {
    const token = makeVendorToken(vendor);
    const response = await request(app)
      .post("/api/user/food/menu")
      .set("Authorization", `Bearer ${token}`)
      .send({
        restaurant_id: vendor._id,
        products: JSON.stringify([]),
      });

    assert.equal(response.status, 400);
  } finally {
    Vendor.findById = originalVendorFindById;
  }
});

test("menu creation succeeds with products array and generates QR code & populated restaurant details", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "chef@example.com",
    isEmailVerified: true,
    status: "active",
    onboardingStatus: "approved",
    onboardingData: {
      restaurantName: "Heritage Awadh Kitchen",
      location: "Gomti Nagar, Lucknow",
      cuisineTypes: ["Awadhi", "Mughlai", "North Indian"],
      mobileNumber: "9876543210",
    },
  };

  const sampleProducts = [
    {
      dishName: "Melt-in-mouth Galouti Kebab",
      foodType: "non-veg",
      badge: "BESTSELLER",
      description: "Smoked mutton patties infused with 32 secret spices",
      price: 420,
      originalPrice: 480,
    },
    {
      dishName: "Paneer Tikka Angara",
      foodType: "veg",
      badge: "PURE VEG",
      description: "Cottage cheese marinated in Kashmiri chilies",
      price: 380,
    },
    {
      dishName: "Dum Murgh Pukht Biryani",
      foodType: "non-veg",
      badge: "HERITAGE CLAY POT",
      description: "Long-grain basmati sealed in clay handi",
      price: 460,
    },
  ];

  const originalVendorFindById = Vendor.findById;
  const originalMenuFindOne = Menu.findOne;
  const originalMenuCreate = Menu.create;

  Vendor.findById = async () => vendor;
  Menu.findOne = async () => null;
  Menu.create = async (doc) => {
    return {
      _id: "678e1234567890abcdef1234",
      ...doc,
      restaurantId: vendor,
      populate: async () => {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  try {
    const token = makeVendorToken(vendor);
    const response = await request(app)
      .post("/api/user/food/menu")
      .set("Authorization", `Bearer ${token}`)
      .field("restaurant_id", vendor._id)
      .field("categoryName", "Chef's Signature Selections")
      .field("categoryDescription", "Recommended dishes for first-time guests")
      .field("products", JSON.stringify(sampleProducts));

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.categoryName, "Chef's Signature Selections");
    assert.equal(response.body.data.totalProducts, 3);
    assert.ok(response.body.data.qrCode.startsWith("data:image/png;base64,"));
    assert.ok(response.body.data.menuUrl.includes(vendor._id));
    assert.equal(response.body.data.restaurant.restaurantName, "Heritage Awadh Kitchen");
    assert.equal(response.body.data.restaurant.location, "Gomti Nagar, Lucknow");
    assert.deepEqual(response.body.data.restaurant.cuisineTypes, ["Awadhi", "Mughlai", "North Indian"]);
  } finally {
    Vendor.findById = originalVendorFindById;
    Menu.findOne = originalMenuFindOne;
    Menu.create = originalMenuCreate;
  }
});

test("GET menu by restaurantId does not require authentication", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "chef@example.com",
    onboardingStatus: "approved",
    onboardingData: {
      restaurantName: "Heritage Awadh Kitchen",
      location: "Gomti Nagar, Lucknow",
      cuisineTypes: ["Awadhi", "Mughlai"],
    },
  };

  const sampleMenu = {
    _id: "678e1234567890abcdef1234",
    restaurantId: vendor._id,
    categoryName: "Chef's Signature Selections",
    categoryDescription: "Recommended dishes for first-time guests",
    products: [
      {
        dishName: "Melt-in-mouth Galouti Kebab",
        foodType: "non-veg",
        badge: "BESTSELLER",
        price: 420,
      },
    ],
    qrCode: "data:image/png;base64,mockQrCodeData",
    menuUrl: `https://metkart.com/menu/${vendor._id}`,
    isActive: true,
  };

  const originalVendorFindById = Vendor.findById;
  const originalMenuFind = Menu.find;

  Vendor.findById = async () => vendor;
  Menu.find = () => ({
    sort: async () => [sampleMenu],
  });

  try {
    const response = await request(app).get(`/api/user/food/menu/${vendor._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.restaurant.restaurantName, "Heritage Awadh Kitchen");
    assert.equal(response.body.totalCategories, 1);
    assert.equal(response.body.totalDishes, 1);
    assert.equal(response.body.data[0].categoryName, "Chef's Signature Selections");
  } finally {
    Vendor.findById = originalVendorFindById;
    Menu.find = originalMenuFind;
  }
});

test("GET QR code specifically does not require authentication", async () => {
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "chef@example.com",
    onboardingStatus: "approved",
    onboardingData: {
      restaurantName: "Heritage Awadh Kitchen",
    },
  };

  const originalVendorFindById = Vendor.findById;
  Vendor.findById = async () => vendor;

  try {
    const response = await request(app).get(`/api/user/food/menu/qr/${vendor._id}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(response.body.qrCode.startsWith("data:image/png;base64,"));
    assert.ok(response.body.menuUrl.includes(vendor._id));
  } finally {
    Vendor.findById = originalVendorFindById;
  }
});
