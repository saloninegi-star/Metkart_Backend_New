const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { createApp } = require("../src/app");
const User = require("../src/modules/user/auth/user.model");
const Product = require("../src/modules/vendor/products/product.model");
const Order = require("../src/modules/user/orders/order.model");

const jwtSecret = "test-secret-that-is-long-enough-for-this-test";
const userId = "507f1f77bcf86cd799439011";
const productId = "507f1f77bcf86cd799439012";

function userToken(id = userId, role = "user") {
  return jwt.sign({ id, role }, jwtSecret, { expiresIn: "5m" });
}

function makeApp() {
  return createApp({ jwtSecret, corsOrigin: "*" });
}

test("order creation requires a user bearer token", async () => {
  const response = await request(makeApp())
    .post("/api/user/orders")
    .send({ userId, productIds: [productId] });

  assert.equal(response.status, 401);
});

test("order creation rejects a body userId different from the token user", async () => {
  const originalFindById = User.findById;
  const otherUserId = "507f1f77bcf86cd799439013";
  User.findById = async () => ({ _id: userId, isVerified: true });

  try {
    const response = await request(makeApp())
      .post("/api/user/orders")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ userId: otherUserId, productIds: [productId] });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.message, "You can only create orders for your own account");
  } finally {
    User.findById = originalFindById;
  }
});

test("verified user can create an order with published products", async () => {
  const originalFindById = User.findById;
  const originalProductFind = Product.find;
  const originalOrderCreate = Order.create;
  let savedOrder;
  let createOrderData;
  const userDetails = {
    _id: userId,
    fullName: "Test User",
    email: "test@example.com",
    mobileNumber: "5551234567",
    currentAddress: "1 Test Street",
  };
  const productDetails = {
    _id: productId,
    title: "Test Product",
    category: "Grocery",
    description: "A test product",
    weightVolume: "1 kg",
    price: 10,
    images: [],
  };
  User.findById = async () => ({ _id: userId, isVerified: true });
  Product.find = async (filter) => {
    assert.deepEqual(filter, {
      _id: { $in: [productId] },
      status: "published",
    });
    return [{ _id: productId, availableQuantity: 5 }];
  };
  Order.create = async (data) => {
    createOrderData = data;
    savedOrder = {
      _id: "order-1",
      status: "pending",
      ...data,
      async populate(populateOptions) {
        assert.deepEqual(populateOptions, [
          { path: "userId", select: "fullName email mobileNumber currentAddress" },
          {
            path: "productIds",
            select: "title category description weightVolume price images",
          },
        ]);
        this.userId = userDetails;
        this.productIds = [productDetails];
        return this;
      },
    };
    return savedOrder;
  };

  try {
    const response = await request(makeApp())
      .post("/api/user/orders")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ userId, productIds: [productId] });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "pending");
    assert.deepEqual(createOrderData.productIds, [productId]);
    assert.deepEqual(response.body.data.userId, userDetails);
    assert.deepEqual(response.body.data.productIds, [productDetails]);
  } finally {
    User.findById = originalFindById;
    Product.find = originalProductFind;
    Order.create = originalOrderCreate;
  }
});

test("order creation rejects empty or invalid product ID arrays", async () => {
  const originalFindById = User.findById;
  User.findById = async () => ({ _id: userId, isVerified: true });

  try {
    const emptyResponse = await request(makeApp())
      .post("/api/user/orders")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ userId, productIds: [] });
    assert.equal(emptyResponse.status, 400);

    const invalidIdResponse = await request(makeApp())
      .post("/api/user/orders")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ userId, productIds: ["not-an-id"] });
    assert.equal(invalidIdResponse.status, 400);
  } finally {
    User.findById = originalFindById;
  }
});

test("order creation rejects unavailable products", async () => {
  const originalFindById = User.findById;
  const originalProductFind = Product.find;
  const originalOrderCreate = Order.create;
  User.findById = async () => ({ _id: userId, isVerified: true });
  Product.find = async () => [];
  Order.create = async () => {
    throw new Error("An unavailable product must not create an order");
  };

  try {
    const response = await request(makeApp())
      .post("/api/user/orders")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ userId, productIds: [productId] });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.message, "One or more products are unavailable");
  } finally {
    User.findById = originalFindById;
    Product.find = originalProductFind;
    Order.create = originalOrderCreate;
  }
});
