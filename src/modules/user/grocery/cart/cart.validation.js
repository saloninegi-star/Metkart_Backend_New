
const mongoose = require("mongoose");
const ApiError = require("../../../../utils/ApiError");

function validateProductId(productId) {
  if (
    typeof productId !== "string" ||
    !mongoose.Types.ObjectId.isValid(productId)
  ) {
    throw new ApiError(400, "A valid productId is required");
  }
}

function validateQuantity(quantity) {
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new ApiError(400, "Quantity must be a positive integer");
  }
}

function validateAddToCart(body) {
  const { productId, quantity = 1 } = body || {};

  validateProductId(productId);
  validateQuantity(quantity);

  return { productId, quantity };
}

function validateUpdateCartItem(body, productId) {
  validateProductId(productId);

  const { quantity } = body || {};
  validateQuantity(quantity);

  return { productId, quantity };
}

module.exports = {
  validateAddToCart,
  validateUpdateCartItem,
};
