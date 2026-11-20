
const mongoose = require("mongoose");

const groceryCartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "VendorProduct",
    required: true,
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: "Quantity must be a whole number",
    },
  },
  priceAtAddition: {
    type: Number,
    required: true,
    min: 0,
  },
});

const groceryCartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: {
      type: [groceryCartItemSchema],
      default: [],
    },
  },
  
  { timestamps: true }
);

const GroceryCart =
  mongoose.models.GroceryCart ||
  mongoose.model("GroceryCart", groceryCartSchema);

module.exports = GroceryCart;
