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

const getOrdersByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "A valid userId is required");
  }

  const orders = await Order.find({ userId })
    .sort({ createdAt: -1 })
    .populate([
      { path: "userId", select: "fullName email mobileNumber currentAddress" },
      {
        path: "productIds",
        select: "title category description weightVolume price images vendorId",
      },
    ]);

  return res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

const getAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;

  const query = {};
  if (status) {
    query.status = status;
  }

  const queryBuilder = Order.find(query)
    .sort({ createdAt: -1 })
    .populate([
      { path: "userId", select: "fullName email mobileNumber currentAddress" },
      {
        path: "productIds",
        select: "title category description weightVolume price images vendorId",
      },
    ]);

  if (page && limit) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [total, orders] = await Promise.all([
      Order.countDocuments(query),
      queryBuilder.skip(skip).limit(limitNum),
    ]);

    return res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      data: orders,
    });
  }

  const orders = await queryBuilder;

  return res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

const getOrdersByVendorId = asyncHandler(async (req, res) => {
  const vendorId = req.params.vendorId || req.params.id;

  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    throw new ApiError(400, "A valid vendorId is required");
  }

  const vendorProducts = await Product.find({ vendorId }).select("_id");
  const productIds = vendorProducts.map((p) => p._id);

  if (productIds.length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      data: [],
    });
  }

  const orders = await Order.find({ productIds: { $in: productIds } })
    .sort({ createdAt: -1 })
    .populate([
      { path: "userId", select: "fullName email mobileNumber currentAddress" },
      {
        path: "productIds",
        select: "title category description weightVolume price images vendorId",
      },
    ]);

  return res.status(200).json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

module.exports = {
  createOrder,
  getOrdersByUserId,
  getAllOrders,
  getOrdersByVendorId,
};
