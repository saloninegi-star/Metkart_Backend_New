const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const ProductCategory = require("../src/modules/admin/vendor/productCategory/productCategory.model");
const ShopType = require("../src/modules/admin/vendor/shopType/shopType.model");
const {
  createProductCategory,
} = require("../src/modules/admin/vendor/productCategory/productCategory.controller");

const app = createApp({
  jwtSecret: "test-secret-that-is-long-enough-for-this-test",
  corsOrigin: "*",
});

test("vendor product category CRUD routes require an admin token", async () => {
  const routes = [
    ["get", "/api/admin/vendor/productcategory"],
    ["post", "/api/admin/vendor/productcategory/507f1f77bcf86cd799439011"],
    ["get", "/api/admin/vendor/productcategory/by-shoptype/507f1f77bcf86cd799439011"],
    ["get", "/api/admin/vendor/productcategory/detail/507f1f77bcf86cd799439011"],
    ["put", "/api/admin/vendor/productcategory/detail/507f1f77bcf86cd799439011"],
    ["delete", "/api/admin/vendor/productcategory/detail/507f1f77bcf86cd799439011"],
  ];

  for (const [method, route] of routes) {
    const response = await request(app)[method](route).send({
      productCategoryName: "Grains",
    });
    assert.equal(response.status, 401, `${method.toUpperCase()} ${route}`);
  }
});

test("admin can create a product category using productcategoryname and shopTypeId", async () => {
  const originalShopTypeFindById = ShopType.findById;
  const originalCategoryFindOne = ProductCategory.findOne;
  const originalCategoryCreate = ProductCategory.create;
  const shopTypeId = "507f1f77bcf86cd799439011";
  const adminId = "507f1f77bcf86cd799439012";
  let created;

  ShopType.findById = async (id) => {
    assert.equal(id, shopTypeId);
    return { _id: shopTypeId, name: "Retail" };
  };
  ProductCategory.findOne = async () => null;
  ProductCategory.create = async (data) => {
    created = data;
    return { _id: "507f1f77bcf86cd799439013", ...data };
  };

  const response = {
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
    await createProductCategory(
      {
        params: { shopTypeId },
        body: { productcategoryname: "  Grains  " },
        admin: { _id: adminId },
      },
      response
    );

    assert.equal(response.statusCode, 201);
    assert.equal(created.shopTypeId, shopTypeId);
    assert.equal(created.productCategoryName, "Grains");
    assert.equal(created.createdBy, adminId);
  } finally {
    ShopType.findById = originalShopTypeFindById;
    ProductCategory.findOne = originalCategoryFindOne;
    ProductCategory.create = originalCategoryCreate;
  }
});

test("duplicate product category response includes the existing category ID", async () => {
  const originalShopTypeFindById = ShopType.findById;
  const originalCategoryFindOne = ProductCategory.findOne;
  const shopTypeId = "507f1f77bcf86cd799439011";
  const categoryId = "507f1f77bcf86cd799439013";

  ShopType.findById = async () => ({ _id: shopTypeId, name: "Retail" });
  ProductCategory.findOne = async () => ({
    _id: categoryId,
    shopTypeId,
    productCategoryName: "Bistro",
  });

  const response = {
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
    await createProductCategory(
      {
        params: { shopTypeId },
        body: { productCategoryName: "Bistro" },
      },
      response
    );

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body.data, {
      _id: categoryId,
      shopTypeId,
      productCategoryName: "Bistro",
    });
  } finally {
    ShopType.findById = originalShopTypeFindById;
    ProductCategory.findOne = originalCategoryFindOne;
  }
});
