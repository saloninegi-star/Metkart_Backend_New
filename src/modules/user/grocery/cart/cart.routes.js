
const express = require("express");
const authenticateUser = require("../../orders/orders.middleware");

const {
  validateAddToCart,
  validateUpdateCartItem,
} = require("./cart.validation");

const controller = require("./cart.controller");

function createCartRoutes(config) {
  const router = express.Router();

  // All grocery cart endpoints require customer authentication.
  router.use(authenticateUser(config.jwtSecret));

  // Validation middleware
  const validateAdd = (req, res, next) => {
    try {
      req.validatedData = validateAddToCart(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

  const validateUpdate = (req, res, next) => {
    try {
      req.validatedData = validateUpdateCartItem(
        req.body,
        req.params.productId
      );
      next();
    } catch (error) {
      next(error);
    }
  };

  router.get("/", controller.getCart);

  router.post("/items", validateAdd, controller.addToCart);

  router.patch(
    "/items/:productId",
    validateUpdate,
    controller.updateCartItem
  );

  router.delete("/items/:productId", controller.removeCartItem);

  router.delete("/", controller.clearCart);

  return router;
}

module.exports = createCartRoutes;
