const mongoose = require("mongoose");

const productCategorySchema = new mongoose.Schema(
  {
    shopTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorShopType",
      required: [true, "Shop type ID is required"],
    },
    productCategoryName: {
      type: String,
      required: [true, "Product category name is required"],
      trim: true,
      maxlength: [120, "Product category name must be 120 characters or fewer"],
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

productCategorySchema.index(
  { shopTypeId: 1, productCategoryName: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("VendorProductCategory", productCategorySchema);
