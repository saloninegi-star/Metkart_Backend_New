const test = require("node:test");
const assert = require("node:assert/strict");
const BusinessType = require("../src/modules/admin/vendor/businessType/businessType.model");
const ShopType = require("../src/modules/admin/vendor/shopType/shopType.model");
const {
  getShopTypesByBusinessType,
} = require("../src/modules/admin/vendor/shopType/shopType.controller");

test("shop types by business returns business type once and a normalized shop type list", async () => {
  const originalFindById = BusinessType.findById;
  const originalFind = ShopType.find;
  const businessTypeId = "507f1f77bcf86cd799439011";
  const businessType = {
    _id: businessTypeId,
    name: "Food",
    desc: "Food business",
    icon: { url: "/food.png", public_id: "food" },
    isActive: true,
  };
  const shopTypes = [
    {
      _id: "507f1f77bcf86cd799439012",
      businessType_id: businessTypeId,
      name: "Restaurant",
      subtitle: "Dine in",
      icon: "/restaurant.png",
      isActive: true,
    },
    {
      _id: "507f1f77bcf86cd799439013",
      businessType_id: businessTypeId,
      name: "Cafe",
      subtitle: "Coffee",
      icon: "/cafe.png",
      isActive: true,
    },
  ];

  BusinessType.findById = async () => businessType;
  ShopType.find = (filter) => {
    assert.deepEqual(filter, { businessType_id: businessTypeId, isActive: true });
    return {
      sort: (sortOrder) => {
        assert.deepEqual(sortOrder, { createdAt: -1 });
        return Promise.resolve(shopTypes);
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
    await getShopTypesByBusinessType(
      { params: { businessTypeId }, query: { isActive: "true" } },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.businessType, businessType);
    assert.equal(res.body.count, 2);
    assert.deepEqual(res.body.data, [
      {
        _id: "507f1f77bcf86cd799439012",
        name: "Restaurant",
        subtitle: "Dine in",
        icon: "/restaurant.png",
        isActive: true,
      },
      {
        _id: "507f1f77bcf86cd799439013",
        name: "Cafe",
        subtitle: "Coffee",
        icon: "/cafe.png",
        isActive: true,
      },
    ]);
  } finally {
    BusinessType.findById = originalFindById;
    ShopType.find = originalFind;
  }
});
