const mongoose = require("mongoose");
const Vendor = require("../../../vendor/auth/vendorAuth.model");
const ProductCategory = require("../productCategory/productCategory.model");
const ShopType = require("../shopType/shopType.model");

const ONBOARDING_TYPES = ["shopkeeper", "restaurant", "mechanic", "scrapVendor"];

function normalizeOnboardingType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "mechanics") return "mechanic";
  if (normalized === "scrapvendor") return "scrapVendor";
  return ONBOARDING_TYPES.find((value) => value.toLowerCase() === normalized);
}

exports.getAllOnboarding = async (req, res) => {
  try {
    const requestedType = req.query.type || req.query.businessType;
    const onboardingType = requestedType
      ? normalizeOnboardingType(requestedType)
      : null;

    if (requestedType && !onboardingType) {
      return res.status(400).json({
        success: false,
        message: `Invalid onboarding type. Use one of: ${ONBOARDING_TYPES.join(", ")}`,
      });
    }

    const filter = { onboardingType: { $in: ONBOARDING_TYPES } };
    if (onboardingType) filter.onboardingType = onboardingType;

    const vendors = await Vendor.find(filter)
      .select(
        "email onboardingType onboardingData onboardingFiles onboardingStatus onboardingReason status isProfileComplete createdAt updatedAt"
      )
      .sort({ createdAt: -1 });
    const records = vendors.map((vendor) =>
      typeof vendor.toObject === "function" ? vendor.toObject() : vendor
    );
    const categoryIds = [
      ...new Set(
        records
          .map((record) => record.onboardingData?.categoryId)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map(String)
      ),
    ];
    const shopTypeIds = [
      ...new Set(
        records
          .map((record) => record.onboardingData?.shopTypeId)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map(String)
      ),
    ];
    const [categories, shopTypes] = await Promise.all([
      categoryIds.length
        ? ProductCategory.find({ _id: { $in: categoryIds } }).select(
            "_id productCategoryName"
          )
        : [],
      shopTypeIds.length
        ? ShopType.find({ _id: { $in: shopTypeIds } }).select("_id name")
        : [],
    ]);
    const categoriesById = new Map(
      categories.map((category) => [String(category._id), category.productCategoryName])
    );
    const shopTypesById = new Map(
      shopTypes.map((shopType) => [String(shopType._id), shopType.name])
    );
    const countsByType = Object.fromEntries(
      ONBOARDING_TYPES.map((type) => [type, 0])
    );

    for (const record of records) {
      const type = record.onboardingType;
      if (Object.hasOwn(countsByType, type)) countsByType[type] += 1;
    }

    return res.status(200).json({
      success: true,
      count: vendors.length,
      selectedType: onboardingType,
      countsByType,
      data: records.map((record) => {
        const form = record.onboardingData || {};
        const categoryId = String(form.categoryId || "");
        const shopTypeId = String(form.shopTypeId || "");
        return {
          id: String(record._id),
          vendorId: String(record._id),
          type: record.onboardingType,
          status: record.onboardingStatus === "approved" ? 1 : 0,
          onboardingStatus: record.onboardingStatus,
          reason: record.onboardingReason ?? null,
          vendorStatus: record.status,
          isProfileComplete: record.isProfileComplete,
          email: record.email,
          form: {
            ...form,
            shopTypeName:
              shopTypesById.get(shopTypeId) ?? form.shopTypeName ?? null,
            productCategoryName:
              categoriesById.get(categoryId) ??
              form.productCategoryName ??
              null,
          },
          files: record.onboardingFiles,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching vendor onboardings",
      error: error.message,
    });
  }
};

exports.setOnboardingStatus = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { action, status, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor ID",
      });
    }

    const approvalAction =
      action || (status === 1 || status === "1" ? "approve" : status === 0 || status === "0" ? "reject" : null);
    if (!["approve", "reject", "block"].includes(approvalAction)) {
      return res.status(400).json({
        success: false,
        message: "Action must be approve, reject, or block",
      });
    }
    const normalizedReason = typeof reason === "string" ? reason.trim() : "";
    if (
      ["reject", "block"].includes(approvalAction) &&
      !normalizedReason
    ) {
      return res.status(400).json({
        success: false,
        message: "A reason is required to reject or block a vendor",
      });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    if (!vendor.onboardingType) {
      return res.status(409).json({
        success: false,
        message: "Vendor onboarding has not been started",
      });
    }

    if (approvalAction === "approve") {
      vendor.onboardingStatus = "approved";
      vendor.status = "active";
      vendor.onboardingReason = null;
    } else if (approvalAction === "reject") {
      vendor.onboardingStatus = "rejected";
      vendor.onboardingReason = normalizedReason;
    } else {
      vendor.onboardingStatus = "blocked";
      vendor.status = "blocked";
      vendor.onboardingReason = normalizedReason;
    }
    await vendor.save();

    return res.status(200).json({
      success: true,
      message: {
        approve: "Vendor onboarding approved",
        reject: "Vendor onboarding rejected",
        block: "Vendor blocked",
      }[approvalAction],
      data: {
        vendorId: String(vendor._id),
        action: approvalAction,
        status: approvalAction === "approve" ? 1 : 0,
        onboardingStatus: vendor.onboardingStatus,
        reason: vendor.onboardingReason ?? null,
        vendorStatus: vendor.status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating vendor onboarding status",
      error: error.message,
    });
  }
};
