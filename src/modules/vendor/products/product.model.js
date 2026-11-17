const mongoose = require("mongoose");

const productImageSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    path: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    weightVolume: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    availableQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    images: {
      type: [productImageSchema],
      default: [],
      validate: {
        validator(images) {
          return this.status !== "published" || images.length >= 3;
        },
        message: "Published products must have at least 3 images",
      },
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
  },
  { timestamps: true }
);

productSchema.index({ vendorId: 1, createdAt: -1 });

module.exports = mongoose.model("VendorProduct", productSchema);
