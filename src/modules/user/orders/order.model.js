const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "VendorProduct",
          required: true,
        },
      ],
      required: true,
      validate: {
        validator(productIds) {
          return productIds.length > 0;
        },
        message: "At least one product is required",
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.UserOrder || mongoose.model("UserOrder", orderSchema);
