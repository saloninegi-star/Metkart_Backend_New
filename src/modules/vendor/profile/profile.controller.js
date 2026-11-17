const path = require("path");
const mongoose = require("mongoose");
const ApiError = require("../../../utils/ApiError");
const BusinessType = require("../../admin/vendor/businessType/businessType.model");
const ProductCategory = require("../../admin/vendor/productCategory/productCategory.model");
const ShopType = require("../../admin/vendor/shopType/shopType.model");
const LegacyShopCategory = require("../../admin/shopkeeper/shopCategory/shopCategory.model");
const LegacyShopType = require("../../admin/shopkeeper/shoptype/shoptype.model");
const { validateOnboardingData } = require("../onboarding/onboarding.validation");

const COMMON_PROFILE_FIELDS = [
  "ownerFullName",
  "mobileNumber",
  "whatsappUpdates",
  "primaryContactSameAsOwner",
  "primaryContactNumber",
  "location",
];
const BUSINESS_NAME_FIELDS = {
  shopkeeper: "shopkeeperName",
  restaurant: "restaurantName",
  mechanic: "garageName",
  scrapVendor: "businessName",
};
const ROLE_PROFILE_FIELDS = {
  shopkeeper: [],
  restaurant: ["cuisineTypes"],
  mechanic: ["serviceCategories", "yearsExperience"],
  scrapVendor: ["scrapCategories", "pickupAvailable"],
};
const PUBLIC_FORM_FIELDS = [
  "businessTypeId",
  "shopTypeId",
  "categoryId",
  "ownerFullName",
  "mobileNumber",
  "whatsappUpdates",
  "primaryContactSameAsOwner",
  "primaryContactNumber",
  "location",
  "gstRegistered",
  "registeredBusinessAddress",
  "restaurantName",
  "cuisineTypes",
  "fssaiNumber",
  "shopkeeperName",
  "garageName",
  "serviceCategories",
  "yearsExperience",
  "businessName",
  "scrapCategories",
  "pickupAvailable",
];

function objectIdString(value) {
  return value ? String(value) : null;
}

function publicFiles(files, type) {
  return (files || []).map((file) => ({
    fieldName: file.fieldName,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: `/api/vendor/onboarding/${type}/files/${encodeURIComponent(
      path.basename(file.path)
    )}`,
  }));
}

async function getProfileDetails(vendor) {
  const form = vendor.onboardingData || {};
  const validId = (id) => mongoose.Types.ObjectId.isValid(id);
  const [businessType, vendorShopType, productCategory] = await Promise.all([
    validId(form.businessTypeId)
      ? BusinessType.findById(form.businessTypeId).select("name")
      : null,
    validId(form.shopTypeId) ? ShopType.findById(form.shopTypeId) : null,
    validId(form.categoryId)
      ? ProductCategory.findById(form.categoryId)
      : null,
  ]);
  const [shopType, category] = await Promise.all([
    vendorShopType ||
      (validId(form.shopTypeId)
        ? LegacyShopType.findById(form.shopTypeId)
        : null),
    productCategory ||
      (validId(form.categoryId)
        ? LegacyShopCategory.findById(form.categoryId)
        : null),
  ]);
  const publicForm = Object.fromEntries(
    PUBLIC_FORM_FIELDS.filter((key) => form[key] !== undefined).map((key) => [
      key,
      form[key],
    ])
  );

  return {
    id: String(vendor._id),
    vendorId: String(vendor._id),
    email: vendor.email,
    isEmailVerified: vendor.isEmailVerified,
    isProfileComplete: vendor.isProfileComplete,
    type: vendor.onboardingType,
    status: vendor.status,
    onboardingStatus: vendor.onboardingStatus,
    reason: vendor.onboardingReason ?? null,
    businessTypeName: businessType?.name ?? null,
    shopTypeName: shopType?.name ?? null,
    productCategoryName:
      category?.productCategoryName ?? category?.name ?? null,
    form: publicForm,
    files: publicFiles(vendor.onboardingFiles, vendor.onboardingType),
    createdAt: vendor.createdAt,
    updatedAt: vendor.updatedAt,
  };
}

exports.getProfile = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getProfileDetails(req.vendor),
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const vendor = req.vendor;
    if (!vendor.onboardingType) {
      throw new ApiError(409, "Vendor onboarding has not been started");
    }

    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      throw new ApiError(400, "Profile updates must be a JSON object");
    }
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, "At least one profile field is required");
    }

    const allowedFields = new Set([
      ...COMMON_PROFILE_FIELDS,
      BUSINESS_NAME_FIELDS[vendor.onboardingType],
      ...(ROLE_PROFILE_FIELDS[vendor.onboardingType] || []),
    ]);
    const unsupportedFields = Object.keys(updates).filter(
      (key) => !allowedFields.has(key)
    );
    if (unsupportedFields.length) {
      throw new ApiError(
        400,
        `Unsupported profile fields: ${unsupportedFields.join(", ")}`
      );
    }

    const validated = validateOnboardingData(
      vendor.onboardingType,
      updates,
      {},
      false
    );
    if (validated.errors.length) {
      throw new ApiError(400, "Profile data is invalid", validated.errors);
    }

    const currentData = vendor.onboardingData || {};
    vendor.onboardingData = {
      ...currentData,
      ...validated.value,
      ...(validated.value.location
        ? {
            location: {
              ...(currentData.location || {}),
              ...validated.value.location,
            },
          }
        : {}),
    };
    await vendor.save();

    return res.status(200).json({
      success: true,
      message: "Vendor profile updated successfully",
      data: await getProfileDetails(vendor),
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteProfile = async (req, res, next) => {
  try {
    const vendor = req.vendor;
    const deletedAt = new Date();
    vendor.deletedAt = deletedAt;
    vendor.isEmailVerified = false;
    vendor.otp = null;
    vendor.otpExpiresAt = null;
    await vendor.save();

    return res.status(200).json({
      success: true,
      message: "Vendor profile deactivated successfully",
      data: {
        vendorId: String(vendor._id),
        deletedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};
