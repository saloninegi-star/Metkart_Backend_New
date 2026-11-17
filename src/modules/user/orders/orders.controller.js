const mongoose = require("mongoose");
const ApiError = require("../../../utils/ApiError");
const asyncHandler = require("../../../utils/async-handler");
const Product = require("../../vendor/products/product.model");
const Order = require("./order.model");

const createOrder = asyncHandler(async (req, res) => {
  const { userId, productIds } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "A valid userId is required");
  }
  if (String(req.user._id) !== String(userId)) {
    throw new ApiError(403, "You can only create orders for your own account");
  }
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ApiError(400, "productIds must be a non-empty array");
  }
  if (productIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new ApiError(400, "Every productIds entry must be a valid product ID");
  }

  const normalizedProductIds = productIds.map(String);
  const uniqueProductIds = [...new Set(normalizedProductIds)];
  const products = await Product.find({
    _id: { $in: uniqueProductIds },
    status: "published",
  });

  if (
    products.length !== uniqueProductIds.length ||
    products.some((product) => product.availableQuantity < 1)
  ) {
    throw new ApiError(400, "One or more products are unavailable");
  }

  const order = await Order.create({
    userId: req.user._id,
    productIds: normalizedProductIds,
  });
  await order.populate([
    { path: "userId", select: "fullName email mobileNumber currentAddress" },
    {
      path: "productIds",
      select: "title category description weightVolume price images",
    },
  ]);

  return res.status(201).json({
    success: true,
    message: "Order created successfully",
    data: order,
  });
});

module.exports = { createOrder };
