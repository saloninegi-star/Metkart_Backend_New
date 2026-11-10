const mongoose = require("mongoose");

const shopTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Shop type name is required"],
      trim: true,
      unique: true,
    },
    subtitle: {
      type: String,
      required: [true, "Subtitle is required"],
      trim: true,
    },
    icon: {
      type: String,
      default: "",
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
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ShopType", shopTypeSchema);