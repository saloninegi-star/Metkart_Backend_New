const fs = require("fs");
const path = require("path");
const ApiError = require("../../../utils/ApiError");
const { storageDirectory } = require("../../../middleware/vendorOnboardingUpload.middleware");
const { validateOnboardingData } = require("./onboarding.validation");
const ShopType = require("../../admin/vendor/shopType/shopType.model");
const ProductCategory = require("../../admin/vendor/productCategory/productCategory.model");
const ShopkeeperShopType = require("../../admin/shopkeeper/shoptype/shoptype.model");
const ShopCategory = require("../../admin/shopkeeper/shopCategory/shopCategory.model");

function filesFromRequest(req) {
  return Object.values(req.files || {}).flat();
}

function removeFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  const allowedRoot = `${storageDirectory}${path.sep}`;
  if (resolvedPath.startsWith(allowedRoot) && fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
  }
}

function removeRequestFiles(req) {
  for (const file of filesFromRequest(req)) {
    removeFile(file.path);
  }
}

function parseData(body) {
  const requestBody = body || {};
  const { data: rawData, ...formFields } = requestBody;
  let data = {};
  if (rawData !== undefined) {
    if (typeof rawData === "string") {
      try {
        data = JSON.parse(rawData);
      } catch {
        throw new ApiError(400, "data must contain valid JSON");
      }
    } else {
      data = rawData;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(400, "Onboarding fields must be a JSON object");
  }

  data = { ...data, ...formFields };
  if (typeof data.location === "string") {
    try {
      data.location = JSON.parse(data.location);
    } catch {
      throw new ApiError(400, "location must contain valid JSON");
    }
  }
  const locationKeys = [
    "shopNo",
    "floor",
    "area",
    "city",
    "nearbyLandmark",
    "latitude",
    "longitude",
  ];
  const location = { ...(data.location || {}) };
  for (const key of locationKeys) {
    if (data[key] === undefined) continue;
    const value = data[key];
    location[key] =
      ["latitude", "longitude"].includes(key) && value !== ""
        ? Number(value)
        : value;
    delete data[key];
  }
  if (Object.keys(location).length) data.location = location;
  return data;
}

function fileMetadata(file) {
  return {
    fieldName: file.fieldname,
    originalName: path.basename(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
    path: path.relative(process.cwd(), file.path).split(path.sep).join("/"),
  };
}

function publicFiles(files, type) {
  return files.map((file) => ({
    fieldName: file.fieldName,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: `/api/vendor/onboarding/${type}/files/${path.basename(file.path)}`,
  }));
}

function ensureType(vendor, type) {
  if (vendor.onboardingType && vendor.onboardingType !== type) {
    throw new ApiError(
      409,
      `This vendor account is already registered as ${vendor.onboardingType}`
    );
  }
}

function approvalStatus(status) {
  return status === "approved" || status === 1 ? 1 : 0;
}

exports.getOnboarding = async (req, res, next) => {
  try {
    ensureType(req.vendor, req.params.type);
    if (!req.vendor.onboardingType) {
      throw new ApiError(404, "Onboarding has not been started");
    }

    const form =
      typeof req.vendor.onboardingData?.toObject === "function"
        ? req.vendor.onboardingData.toObject()
        : { ...(req.vendor.onboardingData || {}) };
    const [vendorShopType, productCategory] = await Promise.all([
      form.shopTypeId ? ShopType.findById(form.shopTypeId) : null,
      form.categoryId ? ProductCategory.findById(form.categoryId) : null,
    ]);
    const [shopType, category] = await Promise.all([
      vendorShopType || (form.shopTypeId ? ShopkeeperShopType.findById(form.shopTypeId) : null),
      productCategory || (form.categoryId ? ShopCategory.findById(form.categoryId) : null),
    ]);
    const categoryName =
      category?.productCategoryName ?? category?.name ?? null;

    return res.status(200).json({
      success: true,
      data: {
        id: String(req.vendor._id),
        vendorId: String(req.vendor._id),
        type: req.vendor.onboardingType,
        status: approvalStatus(req.vendor.onboardingStatus),
        isProfileComplete: req.vendor.isProfileComplete,
        form: {
          ...form,
          shopTypeName: shopType?.name ?? null,
          productCategoryName: categoryName,
        },
        files: publicFiles(req.vendor.onboardingFiles || [], req.params.type),
      },
    });
  } catch (error) {
    return next(error);
  }
};

async function saveOnboarding(req, res, next, submit) {
  let saved = false;
  try {
    const vendor = req.vendor;
    const { type } = req.params;
    ensureType(vendor, type);

    const currentFiles = (vendor.onboardingFiles || []).map((file) =>
      typeof file.toObject === "function" ? file.toObject() : { ...file }
    );
    const incomingFiles = filesFromRequest(req).map(fileMetadata);
    const replacedFields = new Set(incomingFiles.map((file) => file.fieldName));
    const mergedFiles = [
      ...currentFiles.filter((file) => !replacedFields.has(file.fieldName)),
      ...incomingFiles,
    ];
    const filePresence = Object.fromEntries(
      mergedFiles.map((file) => [file.fieldName, true])
    );

    const submittedData = parseData(req.body);
    if (!submittedData.vendorId) {
      removeRequestFiles(req);
      throw new ApiError(400, "vendorId is required in the form data");
    }
    if (String(submittedData.vendorId) !== String(vendor._id)) {
      removeRequestFiles(req);
      throw new ApiError(403, "vendorId does not match the authenticated vendor");
    }
    const validated = validateOnboardingData(type, submittedData, filePresence, submit);
    if (validated.errors.length) {
      removeRequestFiles(req);
      throw new ApiError(400, "Onboarding data is invalid", validated.errors);
    }

    const existingData = vendor.onboardingData || {};
    delete validated.value.vendorId;
    const form = {
      ...existingData,
      ...validated.value,
      ...(validated.value.location
        ? {
            location: {
              ...(existingData.location || {}),
              ...validated.value.location,
            },
          }
        : {}),
    };

    vendor.onboardingType = type;
    vendor.onboardingData = form;
    vendor.onboardingFiles = mergedFiles;
    vendor.onboardingStatus = submit ? "submitted" : "draft";
    vendor.isProfileComplete = submit;
    await vendor.save();
    saved = true;

    const replacedPaths = new Set(
      currentFiles
        .filter((file) => replacedFields.has(file.fieldName))
        .map((file) => path.resolve(process.cwd(), file.path))
    );
    for (const oldPath of replacedPaths) removeFile(oldPath);

    return res.status(200).json({
      success: true,
      message: submit ? "Onboarding submitted for review" : "Onboarding draft saved",
      data: {
        id: String(vendor._id),
        vendorId: String(vendor._id),
        type,
        status: approvalStatus(vendor.onboardingStatus),
        isProfileComplete: vendor.isProfileComplete,
        form,
        files: publicFiles(mergedFiles, type),
      },
    });
  } catch (error) {
    if (!saved) removeRequestFiles(req);
    return next(error);
  }
}

exports.saveDraft = (req, res, next) => saveOnboarding(req, res, next, false);
exports.submitOnboarding = (req, res, next) => saveOnboarding(req, res, next, true);

exports.getOnboardingFile = (req, res, next) => {
  try {
    ensureType(req.vendor, req.params.type);
    const requestedName = path.basename(req.params.filename);
    const storedFile = (req.vendor.onboardingFiles || []).find(
      (file) => path.basename(file.path) === requestedName
    );
    if (!storedFile) throw new ApiError(404, "Onboarding file not found");

    const filePath = path.resolve(process.cwd(), storedFile.path);
    const allowedRoot = `${storageDirectory}${path.sep}`;
    if (!filePath.startsWith(allowedRoot)) {
      throw new ApiError(404, "Onboarding file not found");
    }

    return res.sendFile(filePath, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    return next(error);
  }
};
