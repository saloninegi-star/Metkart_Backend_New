const mongoose = require("mongoose");

const businessTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Business type name is required"],
      trim: true,
      unique: true,
    },
    desc: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    icon: {
      url: {
        type: String,
        required: [true, "Icon URL is required"],
      },
      public_id: {
        type: String, // Cloudinary image ID (future mein delete/replace ke liye)
        default: null,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BusinessType", businessTypeSchema);