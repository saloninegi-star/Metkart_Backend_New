const mongoose = require("mongoose");
const ProductCategory = require("./productCategory.model");
const ShopType = require("../shopType/shopType.model");

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeActive(value) {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function getNameFromBody(body) {
  return body.productcategoryname ?? body.productCategoryName;
}

function categoryNameFilter(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { $regex: new RegExp(`^${escapedName}$`, "i") };
}

exports.createProductCategory = async (req, res) => {
  try {
    const { shopTypeId } = req.params;
    const productCategoryName = getNameFromBody(req.body || {});

    if (!isValidId(shopTypeId)) {
      return res.status(400).json({
        success: false,
        message: "Valid shopTypeId is required in URL params",
      });
    }

    if (typeof productCategoryName !== "string" || !productCategoryName.trim()) {
      return res.status(400).json({
        success: false,
        message: "productCategoryName is required in request body",
      });
    }

    const name = productCategoryName.trim();
    if (name.length > 120) {
      return res.status(400).json({
        success: false,
        message: "productCategoryName must be 120 characters or fewer",
      });
    }

    const shopType = await ShopType.findById(shopTypeId);
    if (!shopType) {
      return res.status(404).json({
        success: false,
        message: "Shop type not found",
      });
    }

    const existing = await ProductCategory.findOne({
      shopTypeId,
      productCategoryName: categoryNameFilter(name),
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Product category already exists under this shop type",
        data: {
          _id: String(existing._id),
          shopTypeId: String(existing.shopTypeId),
          productCategoryName: existing.productCategoryName,
        },
      });
    }

    const productCategory = await ProductCategory.create({
      shopTypeId,
      productCategoryName: name,
      createdBy: req.admin?._id,
    });

    return res.status(201).json({
      success: true,
      message: "Product category created successfully",
      data: productCategory,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Product category already exists under this shop type",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Error creating product category",
      error: error.message,
    });
  }
};

exports.getProductCategoriesByShopType = async (req, res) => {
  try {
    const { shopTypeId } = req.params;
    if (!isValidId(shopTypeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shopTypeId in URL params",
      });
    }

    const shopType = await ShopType.findById(shopTypeId);
    if (!shopType) {
      return res.status(404).json({
        success: false,
        message: "Shop type not found",
      });
    }

    const isActive = normalizeActive(req.query.isActive);
    if (isActive === null) {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    const filter = { shopTypeId };
    if (isActive !== undefined) filter.isActive = isActive;
    const categories = await ProductCategory.find(filter).sort({
      productCategoryName: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching product categories",
      error: error.message,
    });
  }
};

exports.getAllProductCategories = async (req, res) => {
  try {
    const filter = {};
    const isActive = normalizeActive(req.query.isActive);
    if (isActive === null) {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }
    if (isActive !== undefined) filter.isActive = isActive;

    const categories = await ProductCategory.find(filter)
      .populate("shopTypeId", "name subtitle businessType_id")
      .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching product categories",
      error: error.message,
    });
  }
};

exports.getProductCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product category ID",
      });
    }

    const category = await ProductCategory.findById(id).populate(
      "shopTypeId",
      "name subtitle businessType_id"
    );
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Product category not found",
      });
    }
    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching product category",
      error: error.message,
    });
  }
};

exports.updateProductCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const productCategoryName = getNameFromBody(body);
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product category ID",
      });
    }

    const category = await ProductCategory.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Product category not found",
      });
    }

    if (productCategoryName !== undefined) {
      if (typeof productCategoryName !== "string" || !productCategoryName.trim()) {
        return res.status(400).json({
          success: false,
          message: "productCategoryName must be a non-empty string",
        });
      }
      const name = productCategoryName.trim();
      if (name.length > 120) {
        return res.status(400).json({
          success: false,
          message: "productCategoryName must be 120 characters or fewer",
        });
      }
      const duplicate = await ProductCategory.findOne({
        _id: { $ne: id },
        shopTypeId: category.shopTypeId,
        productCategoryName: categoryNameFilter(name),
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Product category already exists under this shop type",
        });
      }
      category.productCategoryName = name;
    }

    if (body.isActive !== undefined) {
      const isActive = normalizeActive(body.isActive);
      if (isActive === null) {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false",
        });
      }
      category.isActive = isActive;
    }

    await category.save();
    return res.status(200).json({
      success: true,
      message: "Product category updated successfully",
      data: category,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Product category already exists under this shop type",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Error updating product category",
      error: error.message,
    });
  }
};

exports.deleteProductCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product category ID",
      });
    }

    const category = await ProductCategory.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Product category not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Product category deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting product category",
      error: error.message,
    });
  }
};
