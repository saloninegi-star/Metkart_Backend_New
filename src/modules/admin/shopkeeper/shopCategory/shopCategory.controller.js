const mongoose = require("mongoose");
const ShopCategory = require("./shopCategory.model");
const ShopType = require("../shoptype/shoptype.model");

// 1. CREATE Category under a ShopType (shopTypeId in PARAMS)
// POST /api/admin/shopkeeper/shopcategory/:shopTypeId
const createCategory = async (req, res) => {
  try {
    const { shopTypeId } = req.params; 
    const { name, sortOrder, isActive } = req.body; 

    if (!shopTypeId) {
      return res.status(400).json({
        success: false,
        message: "shopTypeId is required in URL params",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(shopTypeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shop Type ID in params",
      });
    }

    // Check if ShopType exists
    const shopType = await ShopType.findById(shopTypeId);
    if (!shopType) {
      return res.status(404).json({
        success: false,
        message: "Shop type not found with given shopTypeId",
      });
    }

    // Check duplicate category name under this ShopType
    const existing = await ShopCategory.findOne({
      shopType: shopTypeId,
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Category '${name.trim()}' already exists under '${shopType.name}'`,
      });
    }

    const category = await ShopCategory.create({
      shopType: shopTypeId,
      name: name.trim(),
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.admin?._id,
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating category",
      error: error.message,
    });
  }
};

// 2. GET Categories by ShopType ID (shopTypeId in PARAMS)
// GET /api/admin/shopkeeper/shopcategory/:shopTypeId
const getCategoriesByShopType = async (req, res) => {
  try {
    const { shopTypeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(shopTypeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shop Type ID in params",
      });
    }

    const categories = await ShopCategory.find({
      shopType: shopTypeId,
      isActive: true,
    })
      .select("name sortOrder shopType")
      .sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};

// 3. GET All Categories (Admin View)
// GET /api/admin/shopkeeper/shopcategory
const getAllCategories = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    const categories = await ShopCategory.find(filter)
      .populate("shopType", "name subtitle")
      .sort({ sortOrder: 1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};

// 4. GET Single Category by its ID
// GET /api/admin/shopkeeper/shopcategory/detail/:id
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Category ID",
      });
    }

    const category = await ShopCategory.findById(id).populate("shopType", "name subtitle");
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching category",
      error: error.message,
    });
  }
};

// 5. UPDATE Category by its ID
// PUT /api/admin/shopkeeper/shopcategory/detail/:id
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sortOrder, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Category ID",
      });
    }

    const category = await ShopCategory.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const targetName = name ? name.trim() : category.name;

    if (name) {
      const duplicate = await ShopCategory.findOne({
        _id: { $ne: id },
        shopType: category.shopType,
        name: { $regex: new RegExp(`^${targetName}$`, "i") },
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Category '${targetName}' already exists under this shop type`,
        });
      }
    }

    if (name) category.name = targetName;
    if (sortOrder !== undefined) category.sortOrder = Number(sortOrder);
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating category",
      error: error.message,
    });
  }
};

// 6. DELETE Category by its ID
// DELETE /api/admin/shopkeeper/shopcategory/detail/:id
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Category ID",
      });
    }

    const category = await ShopCategory.findByIdAndDelete(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting category",
      error: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getCategoriesByShopType,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};