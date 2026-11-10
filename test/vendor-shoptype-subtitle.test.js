const test = require("node:test");
const assert = require("node:assert/strict");
const ShopType = require("../src/modules/admin/vendor/shopType/shopType.model");
const BusinessType = require("../src/modules/admin/vendor/businessType/businessType.model");
const { createShopType } = require("../src/modules/admin/vendor/shopType/shopType.controller");

test("shop type subtitle is optional when creating a shop type", async () => {
  const originalBusinessTypeFindById = BusinessType.findById;
  const originalShopTypeFindOne = ShopType.findOne;
  const originalShopTypeCreate = ShopType.create;
  const businessTypeId = "507f1f77bcf86cd799439011";
  const createdShopType = { name: "Both food delivery and dinning" };
  let createInput;

  BusinessType.findById = async () => ({ _id: businessTypeId });
  ShopType.findOne = async () => null;
  ShopType.create = async (input) => {
    createInput = input;
    return createdShopType;
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
    await createShopType(
      {
        params: { businessTypeId },
        body: { name: "Both food delivery and dinning" },
      },
      res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(createInput.name, "Both food delivery and dinning");
    assert.equal(Object.hasOwn(createInput, "subtitle"), false);
    assert.equal(ShopType.schema.path("subtitle").isRequired, false);
  } finally {
    BusinessType.findById = originalBusinessTypeFindById;
    ShopType.findOne = originalShopTypeFindOne;
    ShopType.create = originalShopTypeCreate;
  }
});
