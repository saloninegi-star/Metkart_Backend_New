const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const ShopType = require("./shopType.model");
const BusinessType = require("../businessType/businessType.model"); // Path verify kar lijiye

// Helper: Disk se purani file delete karne ke liye
const deleteFileFromDisk = (filePath) => {
  if (!filePath || filePath.startsWith("http")) return;
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

// 1. CREATE Shop Type (businessTypeId URL Params se)
// POST /api/admin/shopkeeper/shoptype/:businessTypeId
const createShopType = async (req, res) => {
  try {
    const { businessTypeId } = req.params; // <-- URL Params se nikala
    const { name, subtitle, isActive } = req.body;

    // Params validation
    if (!businessTypeId || !mongoose.Types.ObjectId.isValid(businessTypeId)) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Valid businessTypeId is required in URL params",
      });
    }

    // Body validation
    if (!name || (subtitle !== undefined && typeof subtitle !== "string")) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Name is required and subtitle must be text when provided",
      });
    }

    // Check agar valid BusinessType exist karta hai DB mein
    const businessTypeExists = await BusinessType.findById(businessTypeId);
    if (!businessTypeExists) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Business Type not found with this ID",
      });
    }

    // Check duplicate name under the SAME business type
    const existing = await ShopType.findOne({
      businessType_id: businessTypeId,
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existing) {
      if (req.file) deleteFileFromDisk(req.file.path);
      return res.status(409).json({
        success: false,
        message: "Shop type with this name already exists in this business type",
      });
    }

    // Icon Path
    let iconPath = "";
    if (req.file) {
      iconPath = req.file.path.startsWith("http")
        ? req.file.path
        : `/uploads/shoptypes/${req.file.filename}`;
    }

    const activeStatus =
      isActive !== undefined
        ? isActive === "true" || isActive === true
        : true;

    const shopType = await ShopType.create({
      businessType_id: businessTypeId,
      name: name.trim(),
      ...(subtitle !== undefined ? { subtitle: subtitle.trim() } : {}),
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

// 2. GET All Shop Types by Business Type ID (Params se)
// GET /api/admin/shopkeeper/shoptype/by-business/:businessTypeId
const getShopTypesByBusinessType = async (req, res) => {
  try {
    const { businessTypeId } = req.params;
    const { isActive } = req.query;

    if (!mongoose.Types.ObjectId.isValid(businessTypeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid businessTypeId in URL",
      });
    }

    const businessType = await BusinessType.findById(businessTypeId);
    if (!businessType) {
      return res.status(404).json({
        success: false,
        message: "Business type not found",
      });
    }

    const filter = { businessType_id: businessTypeId };

    if (isActive !== undefined) {
      filter.isActive = isActive === "true" || isActive === true;
    }

    const shopTypes = await ShopType.find(filter).sort({ createdAt: -1 });
    const shopTypeData = shopTypes.map((shopType) => {
      const data =
        typeof shopType.toObject === "function" ? shopType.toObject() : { ...shopType };
      delete data.businessType_id;
      return data;
    });

    return res.status(200).json({
      success: true,
      businessType: {
        _id: businessType._id,
        name: businessType.name,
        desc: businessType.desc,
        icon: businessType.icon,
        isActive: businessType.isActive,
      },
      count: shopTypeData.length,
      data: shopTypeData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching shop types",
      error: error.message,
    });
  }
};

// 3. GET Single Shop Type By ID
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

    const shopType = await ShopType.findById(id).populate(
      "businessType_id",
      "name desc icon isActive"
    );

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

// 4. UPDATE Shop Type
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
        businessType_id: shopType.businessType_id,
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      });

      if (duplicate) {
        if (req.file) deleteFileFromDisk(req.file.path);
        return res.status(409).json({
          success: false,
          message: "Another shop type with this name already exists in this business type",
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
      shopType.icon = req.file.path.startsWith("http")
        ? req.file.path
        : `/uploads/shoptypes/${req.file.filename}`;
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

// 5. DELETE Shop Type
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
  getShopTypesByBusinessType,
  getShopTypeById,
  updateShopType,
  deleteShopType,
};