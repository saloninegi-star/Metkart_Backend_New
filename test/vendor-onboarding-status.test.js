const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const Vendor = require("../src/modules/vendor/auth/vendorAuth.model");
const ProductCategory = require("../src/modules/admin/vendor/productCategory/productCategory.model");
const ShopType = require("../src/modules/admin/vendor/shopType/shopType.model");
const {
  getAllOnboarding,
  setOnboardingStatus,
} = require("../src/modules/admin/vendor/onboarding/onboardingApproval.controller");

test("admin onboarding endpoints require an admin token", async () => {
  const response = await request(
    createApp({ jwtSecret: "test-secret", corsOrigin: "*" })
  )
    .patch("/api/admin/vendor/onboarding/507f1f77bcf86cd799439011/status")
    .send({ status: 1 });
  const listResponse = await request(
    createApp({ jwtSecret: "test-secret", corsOrigin: "*" })
  ).get("/api/admin/vendor/onboarding?type=restaurant");

  assert.equal(response.status, 401);
  assert.equal(listResponse.status, 401);
});

test("admin can approve, reject, or block an onboarding", async () => {
  const originalFindById = Vendor.findById;
  const vendorId = "507f1f77bcf86cd799439011";
  const vendor = {
    _id: vendorId,
    onboardingType: "restaurant",
    onboardingStatus: "submitted",
    status: "active",
    async save() {},
  };
  Vendor.findById = async (id) => {
    assert.equal(id, vendorId);
    return vendor;
  };

  const responseFor = (action, reason) => {
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
    return {
      res,
      promise: setOnboardingStatus(
        { params: { vendorId }, body: { action, ...(reason ? { reason } : {}) } },
        res
      ),
    };
  };

  try {
    const accepted = responseFor("approve");
    await accepted.promise;
    assert.equal(accepted.res.statusCode, 200);
    assert.equal(accepted.res.body.data.status, 1);
    assert.equal(vendor.onboardingStatus, "approved");
    assert.equal(vendor.status, "active");

    const rejected = responseFor("reject", "Invalid business documents");
    await rejected.promise;
    assert.equal(rejected.res.statusCode, 200);
    assert.equal(rejected.res.body.data.status, 0);
    assert.equal(vendor.onboardingStatus, "rejected");
    assert.equal(vendor.onboardingReason, "Invalid business documents");
    assert.equal(rejected.res.body.data.reason, "Invalid business documents");

    const blocked = responseFor("block", "Account verification failed");
    await blocked.promise;
    assert.equal(blocked.res.statusCode, 200);
    assert.equal(blocked.res.body.data.status, 0);
    assert.equal(vendor.onboardingStatus, "blocked");
    assert.equal(vendor.status, "blocked");
    assert.equal(vendor.onboardingReason, "Account verification failed");
    assert.equal(blocked.res.body.data.reason, "Account verification failed");

    const missingReason = responseFor("reject");
    await missingReason.promise;
    assert.equal(missingReason.res.statusCode, 400);
    assert.equal(vendor.onboardingStatus, "blocked");
  } finally {
    Vendor.findById = originalFindById;
  }
});

test("admin can get onboarding records filtered by type with counts", async () => {
  const originalFind = Vendor.find;
  const originalProductCategoryFind = ProductCategory.find;
  const originalShopTypeFind = ShopType.find;
  const categoryId = "507f1f77bcf86cd799439012";
  const shopTypeId = "507f1f77bcf86cd799439013";
  const restaurant = {
    _id: "507f1f77bcf86cd799439011",
    email: "restaurant@example.com",
    onboardingType: "restaurant",
    onboardingStatus: "submitted",
    status: "active",
    isProfileComplete: true,
    onboardingReason: "Waiting for review",
    onboardingData: { restaurantName: "Garden", categoryId, shopTypeId },
    onboardingFiles: [],
    toObject() {
      return this;
    },
  };
  Vendor.find = (filter) => {
    assert.deepEqual(filter, { onboardingType: "restaurant" });
    return {
      select: (fields) => {
        assert.match(fields, /onboardingData/);
        assert.match(fields, /onboardingReason/);
        return {
          sort: async (sort) => {
            assert.deepEqual(sort, { createdAt: -1 });
            return [restaurant];
          },
        };
      },
    };
  };
  ProductCategory.find = (filter) => {
    assert.deepEqual(filter, { _id: { $in: [categoryId] } });
    return {
      select: async (fields) => {
        assert.equal(fields, "_id productCategoryName");
        return [{ _id: categoryId, productCategoryName: "Bistro" }];
      },
    };
  };
  ShopType.find = (filter) => {
    assert.deepEqual(filter, { _id: { $in: [shopTypeId] } });
    return {
      select: async (fields) => {
        assert.equal(fields, "_id name");
        return [{ _id: shopTypeId, name: "Restaurant" }];
      },
    };
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
    await getAllOnboarding({ query: { type: "restaurant" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.selectedType, "restaurant");
    assert.equal(res.body.countsByType.restaurant, 1);
    assert.equal(res.body.data[0].vendorId, restaurant._id);
    assert.equal(res.body.data[0].status, 0);
    assert.equal(res.body.data[0].reason, "Waiting for review");
    assert.equal(res.body.data[0].form.shopTypeId, shopTypeId);
    assert.equal(res.body.data[0].form.shopTypeName, "Restaurant");
    assert.equal(res.body.data[0].form.categoryId, categoryId);
    assert.equal(res.body.data[0].form.productCategoryName, "Bistro");
  } finally {
    Vendor.find = originalFind;
    ProductCategory.find = originalProductCategoryFind;
    ShopType.find = originalShopTypeFind;
  }
});
