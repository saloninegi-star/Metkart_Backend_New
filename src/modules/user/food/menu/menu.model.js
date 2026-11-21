const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    dishName: {
      type: String,
      required: [true, "Dish name is required"],
      trim: true,
    },
    foodType: {
      type: String,
      enum: ["veg", "non-veg", "vegan", "egg"],
      default: "veg",
    },
    badge: {
      type: String,
      trim: true,
      default: null, // e.g. "BESTSELLER", "PURE VEG", "HERITAGE CLAY POT"
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price must be greater than or equal to 0"],
    },
    originalPrice: {
      type: Number,
      min: [0, "Original price must be greater than or equal to 0"],
      default: null,
    },
    image: {
      type: String,
      default: null,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const menuSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: [true, "restaurantId is required"],
      index: true,
    },
    categoryName: {
      type: String,
      trim: true,
      default: "Chef's Signature Selections",
    },
    categoryDescription: {
      type: String,
      trim: true,
      default: "Recommended dishes for first-time guests",
    },
    products: {
      type: [productSchema],
      default: [],
    },
    qrCode: {
      type: String, // Base64 Data URL (data:image/png;base64,...)
      default: null,
    },
    menuUrl: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

menuSchema.index({ restaurantId: 1, categoryName: 1 });

module.exports = mongoose.model("Menu", menuSchema);
