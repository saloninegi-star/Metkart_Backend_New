const mongoose = require("mongoose");

const shopTypeSchema = new mongoose.Schema(
  {
    businessType_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessType", // Aapke BusinessType model ka naam
      required: [true, "businessType_id is required"],
    },
    name: {
      type: String,
      required: [true, "Shop type name is required"],
      trim: true,
    },
    subtitle: {
      type: String,
      required: false,
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

// Ek hi BusinessType ke andar same shoptype name duplicate na bane
shopTypeSchema.index({ businessType_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("VendorShopType", shopTypeSchema);