const BusinessType = require("./businessType.model");

// 1. CREATE
exports.createBusinessType = async (req, res) => {
  try {
    const { name, desc, isActive } = req.body;

    // Check agar icon upload hua hai ya nahi
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload an icon image",
      });
    }

    // Name already exist to nahi karta
    const existingType = await BusinessType.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });

    if (existingType) {
      return res.status(400).json({
        success: false,
        message: "Business type with this name already exists",
      });
    }

    
    const iconData = {
      url: req.file.path || req.file.secure_url,
      public_id: req.file.filename || req.file.public_id || null,
    };

    const businessType = await BusinessType.create({
      name,
      desc,
      icon: iconData,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      success: true,
      message: "Business type created successfully",
      data: businessType,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create business type",
    });
  }
};

// 2. READ ALL
exports.getAllBusinessTypes = async (req, res) => {
  try {
    const { isActive } = req.query;
    let filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const businessTypes = await BusinessType.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: businessTypes.length,
      data: businessTypes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch business types",
    });
  }
};

// 3. READ SINGLE
exports.getBusinessTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const businessType = await BusinessType.findById(id);

    if (!businessType) {
      return res.status(404).json({
        success: false,
        message: "Business type not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: businessType,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching business type",
    });
  }
};

// 4. UPDATE
exports.updateBusinessType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, desc, isActive } = req.body;

    const existingBusinessType = await BusinessType.findById(id);
    if (!existingBusinessType) {
      return res.status(404).json({
        success: false,
        message: "Business type not found",
      });
    }

    let iconData = existingBusinessType.icon;

    if (req.file) {
      iconData = {
        url: req.file.path || req.file.secure_url,
        public_id: req.file.filename || req.file.public_id || null,
      };
    }

    const updatedBusinessType = await BusinessType.findByIdAndUpdate(
      id,
      {
        name: name || existingBusinessType.name,
        desc: desc || existingBusinessType.desc,
        isActive: isActive !== undefined ? isActive : existingBusinessType.isActive,
        icon: iconData,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Business type updated successfully",
      data: updatedBusinessType,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update business type",
    });
  }
};

// 5. DELETE
exports.deleteBusinessType = async (req, res) => {
  try {
    const { id } = req.params;
    const businessType = await BusinessType.findByIdAndDelete(id);

    if (!businessType) {
      return res.status(404).json({
        success: false,
        message: "Business type not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Business type deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete business type",
    });
  }
};