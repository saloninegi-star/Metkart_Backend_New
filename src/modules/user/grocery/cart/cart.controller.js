
const mongoose = require("mongoose");
const Cart = require("./cart.model");
const Product = require("../../../vendor/products/product.model");
const ApiError = require("../../../../utils/ApiError");
const asyncHandler = require("../../../../utils/async-handler");

const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id }).populate({
    path: "items.productId",
    select: "title category description weightVolume price availableQuantity images status",
  });

  return res.status(200).json({
    success: true,
    data: cart || {
      userId: req.user._id,
      items: [],
    },
  });
});

const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.validatedData;

  const product = await Product.findOne({
    _id: productId,
    status: "published",
  });

  if (!product) {
    throw new ApiError(404, "Published product not found");
  }

  if (quantity > product.availableQuantity) {
    throw new ApiError(400, "Requested quantity exceeds available stock");
  }

  let cart = await Cart.findOne({ userId: req.user._id });

  if (!cart) {
    cart = new Cart({
      userId: req.user._id,
      items: [],
    });
  }

  const existingItem = cart.items.find(
    (item) => String(item.productId) === String(product._id)
  );

  if (existingItem) {
    const updatedQuantity = existingItem.quantity + quantity;

    if (updatedQuantity > product.availableQuantity) {
      throw new ApiError(400, "Requested quantity exceeds available stock");
    }

    existingItem.quantity = updatedQuantity;
    existingItem.priceAtAddition = product.price;
  } else {
    cart.items.push({
      productId: product._id,
      vendorId: product.vendorId,
      quantity,
      priceAtAddition: product.price,
    });
  }

  await cart.save();

  return res.status(200).json({
    success: true,
    message: "Product added to grocery cart",
    data: cart,
  });
});

const updateCartItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.validatedData;

  const product = await Product.findOne({
    _id: productId,
    status: "published",
  });

  if (!product) {
    throw new ApiError(404, "Published product not found");
  }

  if (quantity > product.availableQuantity) {
    throw new ApiError(400, "Requested quantity exceeds available stock");
  }

  const cart = await Cart.findOne({ userId: req.user._id });

  if (!cart) {
    throw new ApiError(404, "Grocery cart not found");
  }

  const item = cart.items.find(
    (entry) => String(entry.productId) === String(product._id)
  );

  if (!item) {
    throw new ApiError(404, "Product not found in grocery cart");
  }

  item.quantity = quantity;
  item.priceAtAddition = product.price;

  await cart.save();

  return res.status(200).json({
    success: true,
    message: "Grocery cart quantity updated",
    data: cart,
  });
});

const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "A valid productId is required");
  }

  const cart = await Cart.findOne({ userId: req.user._id });

  if (!cart) {
    throw new ApiError(404, "Grocery cart not found");
  }

  const initialLength = cart.items.length;

  cart.items = cart.items.filter(
    (item) => String(item.productId) !== String(productId)
  );

  if (cart.items.length === initialLength) {
    throw new ApiError(404, "Product not found in grocery cart");
  }

  await cart.save();

  return res.status(200).json({
    success: true,
    message: "Product removed from grocery cart",
    data: cart,
  });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });

  if (!cart) {
    return res.status(200).json({
      success: true,
      message: "Grocery cart is already empty",
    });
  }

  cart.items = [];
  await cart.save();

  return res.status(200).json({
    success: true,
    message: "Grocery cart cleared",
    data: cart,
  });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};
