const mongoose = require("mongoose");

const shopCategorySchema = new mongoose.Schema(
  {
    shopType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopType",
      required: [true, "Shop Type ID is required"],
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);


shopCategorySchema.index({ shopType: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("ShopCategory", shopCategorySchema);