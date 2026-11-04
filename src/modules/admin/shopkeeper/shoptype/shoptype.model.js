const mongoose = require("mongoose");

const shopTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Shop type name is required"],
      unique: true,
      trim: true,
    },
    subtitle: {
      type: String,
      required: [true, "Subtitle is required"],
      trim: true,
    },
    icon: {
      type: String,
      default: "",
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

module.exports = mongoose.model("ShopType", shopTypeSchema);