const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const ShopType = require("./shoptype.model");

// Helper: disk se file delete karne ke liye
const deleteFileFromDisk = (filePath) => {
  if (!filePath) return;
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

// 1. CREATE Shop Type
// POST /api/admin/shopkeeper/shoptype
const createShopType = async (req, res) => {
  try {
    const { name, subtitle, isActive } = req.body;

    if (!name || !subtitle) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Name and subtitle are required",
      });
    }

    // Check duplicate name
    const existing = await ShopType.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existing) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(409).json({
        success: false,
        message: "Shop type with this name already exists",
      });
    }

    // Image file ka path
    const iconPath = req.file
      ? `/uploads/shoptypes/${req.file.filename}`
      : "";

    // isActive boolean format me convert
    const activeStatus =
      isActive !== undefined
        ? isActive === "true" || isActive === true
        : true;

    const shopType = await ShopType.create({
      name: name.trim(),
      subtitle: subtitle.trim(),
      icon: iconPath,
      isActive: activeStatus,
      createdBy: req.admin?._id,
    });

    return res.status(201).json({
      success: true,
      message: "Shop type created successfully",
      data: shopType,
    });
  } catch (error) {
    if (req.file) deleteFileFromDisk(req.file.path);
    return res.status(500).json({
      success: false,
      message: "Error creating shop type",
      error: error.message,
    });
  }
};

// 2. GET All Shop Types (Admin Panel)
// GET /api/admin/shopkeeper/shoptype
const getAllShopTypes = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }

    const shopTypes = await ShopType.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: shopTypes.length,
      data: shopTypes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching shop types",
      error: error.message,
    });
  }
};

// 3. GET Active Shop Types (User/App ke liye)
// GET /api/admin/shopkeeper/shoptype/active
const getActiveShopTypes = async (req, res) => {
  try {
    const shopTypes = await ShopType.find({ isActive: true })
      .select("name subtitle icon isActive")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: shopTypes.length,
      data: shopTypes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching active shop types",
      error: error.message,
    });
  }
};

// 4. GET Single Shop Type By ID
// GET /api/admin/shopkeeper/shoptype/:id
const getShopTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shop Type ID",
      });
    }

    const shopType = await ShopType.findById(id);
    if (!shopType) {
      return res.status(404).json({
        success: false,
        message: "Shop type not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: shopType,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching shop type",
      error: error.message,
    });
  }
};

// 5. UPDATE Shop Type
// PUT /api/admin/shopkeeper/shoptype/:id
const updateShopType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subtitle, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Invalid Shop Type ID",
      });
    }

    const shopType = await ShopType.findById(id);
    if (!shopType) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Shop type not found",
      });
    }

    if (name && name.trim() !== shopType.name) {
      const duplicate = await ShopType.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      });

      if (duplicate) {
        if (req.file) deleteFileFromDisk(req.file.path);
        return res.status(409).json({
          success: false,
          message: "Another shop type with this name already exists",
        });
      }
      shopType.name = name.trim();
    }

    if (subtitle !== undefined) shopType.subtitle = subtitle.trim();
    if (isActive !== undefined) {
      shopType.isActive = isActive === "true" || isActive === true;
    }

    if (req.file) {
      if (shopType.icon) {
        deleteFileFromDisk(shopType.icon);
      }
      shopType.icon = `/uploads/shoptypes/${req.file.filename}`;
    }

    await shopType.save();

    return res.status(200).json({
      success: true,
      message: "Shop type updated successfully",
      data: shopType,
    });
  } catch (error) {
    if (req.file) deleteFileFromDisk(req.file.path);
    return res.status(500).json({
      success: false,
      message: "Error updating shop type",
      error: error.message,
    });
  }
};

// 6. DELETE Shop Type
// DELETE /api/admin/shopkeeper/shoptype/:id
const deleteShopType = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Shop Type ID",
      });
    }

    const shopType = await ShopType.findByIdAndDelete(id);
    if (!shopType) {
      return res.status(404).json({
        success: false,
        message: "Shop type not found",
      });
    }

    if (shopType.icon) {
      deleteFileFromDisk(shopType.icon);
    }

    return res.status(200).json({
      success: true,
      message: "Shop type deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting shop type",
      error: error.message,
    });
  }
};

module.exports = {
  createShopType,
  getAllShopTypes,
  getActiveShopTypes,
  getShopTypeById,
  updateShopType,
  deleteShopType,
};