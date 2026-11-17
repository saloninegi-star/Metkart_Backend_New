const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const Product = require("../src/modules/vendor/products/product.model");
const {
  createProduct,
  deleteProduct,
  updateProduct,
} = require("../src/modules/vendor/products/products.controller");

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

test("vendor product mutations require a bearer token", async () => {
  const app = createApp({
    jwtSecret: "test-secret-that-is-long-enough-for-this-test",
    corsOrigin: "*",
  });
  const protectedRoutes = [
    ["post", "/api/vendor/products"],
    ["put", "/api/vendor/products/product-1"],
    ["delete", "/api/vendor/products/product-1"],
  ];

  for (const [method, route] of protectedRoutes) {
    const response = await request(app)[method](route);
    assert.equal(response.status, 401, `${method.toUpperCase()} ${route}`);
  }
});

test("product images are publicly accessible", async () => {
  const originalFindOne = Product.findOne;
  Product.findOne = async (query) => {
    assert.deepEqual(query, { _id: "product-1" });
    return null;
  };

  try {
    const response = await request(
      createApp({
        jwtSecret: "test-secret-that-is-long-enough-for-this-test",
        corsOrigin: "*",
      })
    ).get("/api/vendor/products/product-1/images/image.webp");

    assert.equal(response.status, 404);
  } finally {
    Product.findOne = originalFindOne;
  }
});

test("create product saves Figma fields and sets the first image as cover", async () => {
  const originalCreate = Product.create;
  const vendorId = "507f1f77bcf86cd799439011";
  Product.create = async (data) => ({ _id: "product-1", ...data });
  const res = responseRecorder();

  try {
    await createProduct(
      {
        vendor: { _id: vendorId },
        body: {
          title: "Organic Honey",
          category: "Grocery",
          description: "Raw local honey",
          weightVolume: "500g",
          expiryDate: "2027-01-15",
          price: "450",
          availableQuantity: "10",
        },
        files: [
          {
            filename: "cover.webp",
            path: "storage/vendor-products/cover.webp",
            mimetype: "image/webp",
            size: 20,
          },
        ],
      },
      res,
      (error) => {
        throw error;
      }
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.vendorId, vendorId);
    assert.equal(res.body.data.status, "draft");
    assert.equal(res.body.data.title, "Organic Honey");
    assert.equal(res.body.data.images[0].isCover, true);
    assert.equal(
      res.body.data.images[0].url,
      "/api/vendor/products/product-1/images/cover.webp"
    );
  } finally {
    Product.create = originalCreate;
  }
});

test("publishing a product requires at least three images", async () => {
  const originalCreate = Product.create;
  Product.create = async () => {
    throw new Error("A product missing the image requirement must not be stored");
  };
  const res = responseRecorder();
  let nextError;

  try {
    await createProduct(
      {
        vendor: { _id: "507f1f77bcf86cd799439011" },
        body: {
          title: "Organic Honey",
          category: "Grocery",
          description: "Raw local honey",
          weightVolume: "500g",
          price: "450",
          availableQuantity: "10",
          status: "published",
        },
        files: [],
      },
      res,
      (error) => {
        nextError = error;
      }
    );

    assert.equal(res.statusCode, null);
    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.message, "At least 3 product images are required to publish");
  } finally {
    Product.create = originalCreate;
  }
});

test("update and delete only target the authenticated vendor's product", async () => {
  const originalFindOne = Product.findOne;
  const originalFindOneAndDelete = Product.findOneAndDelete;
  const vendorId = "507f1f77bcf86cd799439011";
  const queries = [];
  Product.findOne = async (query) => {
    queries.push(query);
    return null;
  };
  Product.findOneAndDelete = async (query) => {
    queries.push(query);
    return null;
  };

  try {
    for (const handler of [updateProduct, deleteProduct]) {
      let nextError;
      const res = responseRecorder();
      await handler(
        {
          vendor: { _id: vendorId },
          params: { productId: "another-vendor-product" },
          body: {},
          files: [],
        },
        res,
        (error) => {
          nextError = error;
        }
      );
      assert.equal(nextError.statusCode, 404);
      assert.equal(nextError.message, "Product not found");
    }

    assert.deepEqual(queries, [
      { _id: "another-vendor-product", vendorId },
      { _id: "another-vendor-product", vendorId },
    ]);
  } finally {
    Product.findOne = originalFindOne;
    Product.findOneAndDelete = originalFindOneAndDelete;
  }
});

test("update changes supplied product fields without changing vendor ownership", async () => {
  const originalFindOne = Product.findOne;
  const vendorId = "507f1f77bcf86cd799439011";
  const product = {
    _id: "product-1",
    vendorId,
    title: "Old title",
    category: "Grocery",
    description: "Description",
    weightVolume: "500g",
    price: 450,
    availableQuantity: 10,
    images: [],
    status: "draft",
    async save() {},
  };
  Product.findOne = async (query) => {
    assert.deepEqual(query, { _id: "product-1", vendorId });
    return product;
  };
  const res = responseRecorder();

  try {
    await updateProduct(
      {
        vendor: { _id: vendorId },
        params: { productId: "product-1" },
        body: { title: "Updated honey" },
        files: [],
      },
      res,
      (error) => {
        throw error;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(product.title, "Updated honey");
    assert.equal(product.vendorId, vendorId);
  } finally {
    Product.findOne = originalFindOne;
  }
});

test("delete removes the vendor-owned product and confirms deletion", async () => {
  const originalFindOneAndDelete = Product.findOneAndDelete;
  const vendorId = "507f1f77bcf86cd799439011";
  Product.findOneAndDelete = async (query) => {
    assert.deepEqual(query, { _id: "product-1", vendorId });
    return { _id: "product-1", images: [] };
  };
  const res = responseRecorder();

  try {
    await deleteProduct(
      {
        vendor: { _id: vendorId },
        params: { productId: "product-1" },
      },
      res,
      (error) => {
        throw error;
      }
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, { id: "product-1" });
  } finally {
    Product.findOneAndDelete = originalFindOneAndDelete;
  }
});

test("public product listing includes vendor-created drafts", async () => {
  const originalFind = Product.find;
  const draftProduct = {
    _id: "product-1",
    vendorId: "507f1f77bcf86cd799439011",
    title: "Organic Honey",
    status: "draft",
    images: [],
  };
  Product.find = (query) => ({
    sort: async (sortOrder) => {
      assert.deepEqual(query, {});
      assert.deepEqual(sortOrder, { createdAt: -1 });
      return [draftProduct];
    },
  });

  try {
    const response = await request(
      createApp({
        jwtSecret: "test-secret-that-is-long-enough-for-this-test",
        corsOrigin: "*",
      })
    )
      .get("/api/vendor/products");

    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.data[0].title, "Organic Honey");
    assert.equal(response.body.data[0].status, "draft");
  } finally {
    Product.find = originalFind;
  }
});
