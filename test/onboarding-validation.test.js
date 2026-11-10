const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const ShopType = require("../src/modules/admin/vendor/shopType/shopType.model");
const ProductCategory = require("../src/modules/admin/vendor/productCategory/productCategory.model");
const { getOnboarding } = require("../src/modules/vendor/onboarding/onboarding.controller");
const {
  allowedFileFields,
  validateOnboardingData,
} = require("../src/modules/vendor/onboarding/onboarding.validation");

test("get onboarding includes names for selected shop type and category", async () => {
  const originalShopTypeFindById = ShopType.findById;
  const originalProductCategoryFindById = ProductCategory.findById;
  const vendorId = "507f1f77bcf86cd799439011";
  const shopTypeId = "507f1f77bcf86cd799439012";
  const categoryId = "507f1f77bcf86cd799439013";
  const vendor = {
    _id: vendorId,
    onboardingType: "restaurant",
    onboardingStatus: "draft",
    isProfileComplete: false,
    onboardingData: { shopTypeId, categoryId },
    onboardingFiles: [],
  };
  ShopType.findById = async (id) => {
    assert.equal(id, shopTypeId);
    return { _id: shopTypeId, name: "Restaurant", subtitle: "Food delivery and dining" };
  };
  ProductCategory.findById = async (id) => {
    assert.equal(id, categoryId);
    return { _id: categoryId, productCategoryName: "North Indian" };
  };

  const res = {
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

  try {
    await getOnboarding({ vendor, params: { type: "restaurant" } }, res, (error) => {
      throw error;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.form.shopTypeId, shopTypeId);
    assert.equal(res.body.data.form.shopTypeName, "Restaurant");
    assert.equal(res.body.data.form.categoryId, categoryId);
    assert.equal(res.body.data.form.productCategoryName, "North Indian");
  } finally {
    ShopType.findById = originalShopTypeFindById;
    ProductCategory.findById = originalProductCategoryFindById;
  }
});

test("onboarding roles accept their own JSON keys and reject another role's keys", () => {
  const shopkeeperDraft = validateOnboardingData(
    "shopkeeper",
    { shopkeeperName: "  Green Mart  ", categoryId: "507f1f77bcf86cd799439011" },
    {},
    false
  );
  assert.deepEqual(shopkeeperDraft.errors, []);
  assert.equal(shopkeeperDraft.value.shopkeeperName, "Green Mart");

  const wrongRole = validateOnboardingData(
    "shopkeeper",
    { restaurantName: "Cafe" },
    {},
    false
  );
  assert.ok(wrongRole.errors.some((error) => error.includes("restaurantName")));
});

test("restaurant, mechanic, and scrap-vendor drafts accept their own fields", () => {
  const drafts = [
    ["restaurant", { restaurantName: "Cafe", cuisineTypes: ["South Indian"], fssaiNumber: "12345" }],
    ["mechanic", { garageName: "Auto Care", serviceCategories: ["Repair"], yearsExperience: 5 }],
    ["scrapVendor", { businessName: "Green Scrap", scrapCategories: ["Metal"], pickupAvailable: true }],
  ];

  for (const [type, data] of drafts) {
    assert.deepEqual(validateOnboardingData(type, data, {}, false).errors, []);
  }
});

test("onboarding files use the same field names for each vendor type", () => {
  assert.deepEqual(allowedFileFields, [
    "panCard",
    "aadhaarCard",
    "storefrontPhotos",
    "gstCertificate",
    "tradeLicense",
    "bankProof",
  ]);
});

test("onboarding endpoints require a vendor token", async () => {
  const app = createApp({
    jwtSecret: "test-secret-that-is-long-enough-for-this-test",
    corsOrigin: "*",
  });
  const response = await request(app)
    .put("/api/vendor/onboarding/shopkeeper")
    .send({ shopkeeperName: "Green Mart" });

  assert.equal(response.status, 401);
});

test("authenticated vendors can save a role-specific draft", async () => {
  const originalFindById = Vendor.findById;
  const vendor = {
    _id: "507f1f77bcf86cd799439011",
    email: "vendor@example.com",
    isEmailVerified: true,
    status: "active",
    onboardingType: null,
    onboardingData: {},
    onboardingFiles: [],
    async save() {},
  };
  Vendor.findById = async () => vendor;

  try {
    const secret = process.env.JWT_SECRET || "your_metkart_jwt_secret_key";
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: "vendor" },
      secret,
      { expiresIn: "1h" }
    );
    const response = await request(
      createApp({
        jwtSecret: secret,
        corsOrigin: "*",
      })
    )
      .put("/api/vendor/onboarding/shopkeeper")
      .set("Authorization", `Bearer ${token}`)
      .field("vendorId", vendor._id)
      .field("businessTypeId", "507f1f77bcf86cd799439012")
      .field("shopTypeId", "507f1f77bcf86cd799439013")
      .field("categoryId", "507f1f77bcf86cd799439014")
      .field("shopkeeperName", "Green Mart")
      .field("ownerFullName", "Owner Name")
      .field("area", "Kothrud")
      .field("city", "Pune");

    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 0);
    assert.equal(response.body.data.form.shopkeeperName, "Green Mart");
    assert.equal(response.body.data.id, vendor._id);
    assert.equal(response.body.data.vendorId, vendor._id);
    assert.deepEqual(response.body.data.form.location, {
      area: "Kothrud",
      city: "Pune",
    });
    assert.equal(vendor.onboardingType, "shopkeeper");
    assert.equal(vendor.onboardingStatus, "draft");
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("shopkeeper submission requires the Figma profile, tax, bank, and document fields", () => {
  const result = validateOnboardingData(
    "shopkeeper",
    {
      vendorId: "507f1f77bcf86cd799439011",
      businessTypeId: "507f1f77bcf86cd799439012",
      shopTypeId: "507f1f77bcf86cd799439013",
      categoryId: "507f1f77bcf86cd799439014",
      shopkeeperName: "Green Mart",
      ownerFullName: "Owner Name",
      email: "owner@example.com",
      mobileNumber: "+91 9876543210",
      location: { area: "Kothrud", city: "Pune" },
      panNumber: "ABCDE1234F",
      panFullName: "Owner Name",
      gstRegistered: false,
      tradeLicenseNumber: "TL-123",
      bankAccountNumber: "123456789",
      bankAccountNumberConfirm: "123456789",
      ifscCode: "SBIN0001234",
      accountType: "Savings",
    },
    { panCard: true, aadhaarCard: true, storefrontPhotos: true },
    true
  );

  assert.deepEqual(result.errors, []);
  assert.equal("bankAccountNumberConfirm" in result.value, false);
});

test("onboarding submission rejects mismatched account numbers and missing documents", () => {
  const result = validateOnboardingData(
    "shopkeeper",
    {
      vendorId: "507f1f77bcf86cd799439011",
      businessTypeId: "507f1f77bcf86cd799439012",
      shopTypeId: "507f1f77bcf86cd799439013",
      categoryId: "507f1f77bcf86cd799439014",
      shopkeeperName: "Green Mart",
      ownerFullName: "Owner Name",
      email: "owner@example.com",
      mobileNumber: "+91 9876543210",
      location: { area: "Kothrud", city: "Pune" },
      panNumber: "ABCDE1234F",
      panFullName: "Owner Name",
      gstRegistered: false,
      tradeLicenseNumber: "TL-123",
      bankAccountNumber: "123456789",
      bankAccountNumberConfirm: "987654321",
      ifscCode: "SBIN0001234",
      accountType: "Savings",
    },
    {},
    true
  );

  assert.ok(result.errors.includes("Bank account numbers do not match"));
  assert.ok(result.errors.includes("panCard file is required"));
  assert.ok(result.errors.includes("aadhaarCard file is required"));
  assert.ok(result.errors.includes("storefrontPhotos file is required"));
});
