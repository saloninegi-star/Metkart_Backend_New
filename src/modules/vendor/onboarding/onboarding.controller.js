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

  if (data.fullName && !data.ownerFullName) data.ownerFullName = data.fullName;
  if (data.ownerFullName && !data.fullName) data.fullName = data.ownerFullName;
  if (data.emailAddress && !data.email) data.email = data.emailAddress;
  if (data.mechanicName && !data.garageName) data.garageName = data.mechanicName;
  if (data.garageName && !data.mechanicName) data.mechanicName = data.garageName;
  if (data.shopkeeperName && !data.shopName) data.shopName = data.shopkeeperName;
  if (data.shopName && !data.shopkeeperName) data.shopkeeperName = data.shopName;
  if (data.scrapVendorName && !data.businessName) data.businessName = data.scrapVendorName;
  if (data.fssaiLicenseNumber && !data.fssaiNumber) data.fssaiNumber = data.fssaiLicenseNumber;
  if (data.servicesOffered && !data.serviceCategories) data.serviceCategories = data.servicesOffered;
  if (data.serviceCategories && !data.servicesOffered) data.servicesOffered = data.serviceCategories;

  if (typeof data.location === "string") {
    try {
      data.location = JSON.parse(data.location);
    } catch {
      throw new ApiError(400, "location must contain valid JSON");
    }
  }
  const locationKeys = [
    "shopNo",
    "buildingNo",
    "floor",
    "town",
    "area",
    "sector",
    "locality",
    "city",
    "state",
    "pincode",
    "nearbyLandmark",
    "landmark",
    "latitude",
    "longitude",
    "formattedAddress",
    "googleMapsLocation",
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
  if (!location.area && (location.sector || location.locality)) {
    location.area = location.sector || location.locality;
  }
  if (!location.shopNo && location.buildingNo) {
    location.shopNo = location.buildingNo;
  }
  if (!location.floor && location.town) {
    location.floor = location.town;
  }
  if (!location.nearbyLandmark && location.landmark) {
    location.nearbyLandmark = location.landmark;
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
    url: `/api/vendor/onboarding/${type || "vendor"}/files/${path.basename(file.path)}`,
  }));
}

function ensureType(vendor, type) {
  const existingType = vendor.roleType || vendor.onboardingType;
  if (existingType && existingType !== type) {
    throw new ApiError(
      409,
      `This vendor account is already registered as ${existingType}`
    );
  }
}

function approvalStatus(status) {
  return status === "approved" || status === 1 ? 1 : 0;
}

exports.getOnboarding = async (req, res, next) => {
  try {
    const type = req.params.type || req.vendor.roleType || req.vendor.onboardingType;
    if (req.params.type) {
      ensureType(req.vendor, req.params.type);
    }
    if (!req.vendor.onboardingType && !req.vendor.roleType) {
      throw new ApiError(404, "Onboarding has not been started");
    }

    const form =
      typeof req.vendor.onboardingData?.toObject === "function"
        ? req.vendor.onboardingData.toObject()
        : { ...(req.vendor.onboardingData || {}) };
    const shopTypeId = req.vendor.shopTypeId || form.shopTypeId;
    const categoryId = req.vendor.categoryId || req.vendor.productCategoryId || form.categoryId;

    const [vendorShopType, productCategory] = await Promise.all([
      shopTypeId ? ShopType.findById(shopTypeId) : null,
      categoryId ? ProductCategory.findById(categoryId) : null,
    ]);
    const [shopType, category] = await Promise.all([
      vendorShopType || (shopTypeId ? ShopkeeperShopType.findById(shopTypeId) : null),
      productCategory || (categoryId ? ShopCategory.findById(categoryId) : null),
    ]);
    const categoryName =
      category?.productCategoryName ?? category?.name ?? req.vendor.productCategory ?? null;

    return res.status(200).json({
      success: true,
      data: {
        id: String(req.vendor._id),
        vendorId: String(req.vendor._id),
        type: req.vendor.roleType || req.vendor.onboardingType,
        roleType: req.vendor.roleType || req.vendor.onboardingType,
        status: approvalStatus(req.vendor.onboardingStatus),
        onboardingStatus: req.vendor.onboardingStatus,
        isProfileComplete: req.vendor.isProfileComplete,
        form: {
          ...form,
          shopTypeName: shopType?.name ?? null,
          productCategoryName: categoryName,
        },
        location: req.vendor.location,
        panDetails: req.vendor.panDetails,
        aadhaarDetails: req.vendor.aadhaarDetails,
        gstDetails: req.vendor.gstDetails,
        bankDetails: req.vendor.bankDetails,
        restaurantDetails: req.vendor.restaurantDetails,
        mechanicDetails: req.vendor.mechanicDetails,
        shopkeeperDetails: req.vendor.shopkeeperDetails,
        userDetails: req.vendor.userDetails,
        scrapVendorDetails: req.vendor.scrapVendorDetails,
        files: publicFiles(req.vendor.onboardingFiles || [], type),
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
    const type = req.params.type || req.body?.roleType || req.body?.type || req.body?.onboardingType;
    if (!type) {
      throw new ApiError(400, "Role type (e.g. restaurant, mechanic, shopkeeper) is required");
    }
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
      submittedData.vendorId = String(vendor._id);
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

    // Build URL and path lookups for mapped files
    const fileUrls = {};
    const filePaths = {};
    for (const f of mergedFiles) {
      const url = `/api/vendor/onboarding/${type}/files/${path.basename(f.path)}`;
      if (!fileUrls[f.fieldName]) {
        fileUrls[f.fieldName] = [];
        filePaths[f.fieldName] = [];
      }
      fileUrls[f.fieldName].push(url);
      filePaths[f.fieldName].push(f.path);
    }

    // 1. Common root-level fields
    vendor.roleType = type;
    vendor.onboardingType = type;

    if (validated.value.ownerFullName) {
      vendor.ownerFullName = validated.value.ownerFullName;
      vendor.fullName = validated.value.ownerFullName;
    }
    if (validated.value.mobileNumber) vendor.mobileNumber = validated.value.mobileNumber;
    if (validated.value.email) vendor.email = validated.value.email;
    if (validated.value.whatsappUpdates !== undefined) vendor.whatsappUpdates = validated.value.whatsappUpdates;
    if (validated.value.primaryContactSameAsOwner !== undefined) {
      vendor.primaryContactSameAsOwner = validated.value.primaryContactSameAsOwner;
    }
    if (validated.value.primaryContactNumber !== undefined) {
      vendor.primaryContactNumber = validated.value.primaryContactNumber;
    }
    if (validated.value.businessTypeId) vendor.businessTypeId = validated.value.businessTypeId;
    if (validated.value.shopTypeId) vendor.shopTypeId = validated.value.shopTypeId;
    if (validated.value.categoryId) vendor.categoryId = validated.value.categoryId;
    if (validated.value.productCategoryId) vendor.productCategoryId = validated.value.productCategoryId;
    if (validated.value.productCategory) vendor.productCategory = validated.value.productCategory;
    if (validated.value.termsAccepted !== undefined) vendor.termsAccepted = validated.value.termsAccepted;

    // Location
    if (validated.value.location) {
      const prevLocation = typeof vendor.location?.toObject === "function"
        ? vendor.location.toObject()
        : { ...(vendor.location || {}) };
      vendor.location = { ...prevLocation, ...validated.value.location };
    }

    // PAN Details
    const prevPan = typeof vendor.panDetails?.toObject === "function"
      ? vendor.panDetails.toObject()
      : { ...(vendor.panDetails || {}) };
    vendor.panDetails = {
      ...prevPan,
      panNumber: validated.value.panNumber || prevPan.panNumber || null,
      fullName: validated.value.panFullName || validated.value.ownerFullName || prevPan.fullName || null,
      businessAddress: validated.value.registeredBusinessAddress || validated.value.panAddress || prevPan.businessAddress || null,
      cardUrl: fileUrls["panCard"]?.[0] || prevPan.cardUrl || null,
      cardPath: filePaths["panCard"]?.[0] || prevPan.cardPath || null,
    };
    if (validated.value.panNumber) vendor.panNumber = validated.value.panNumber;
    if (validated.value.panFullName) vendor.panFullName = validated.value.panFullName;

    // Aadhaar Details
    const prevAadhaar = typeof vendor.aadhaarDetails?.toObject === "function"
      ? vendor.aadhaarDetails.toObject()
      : { ...(vendor.aadhaarDetails || {}) };
    vendor.aadhaarDetails = {
      ...prevAadhaar,
      aadhaarNumber: validated.value.aadhaarNumber || prevAadhaar.aadhaarNumber || null,
      fullName: validated.value.aadhaarFullName || validated.value.ownerFullName || prevAadhaar.fullName || null,
      businessAddress: validated.value.aadhaarAddress || validated.value.registeredBusinessAddress || prevAadhaar.businessAddress || null,
      cardUrl: fileUrls["aadhaarCard"]?.[0] || prevAadhaar.cardUrl || null,
      cardPath: filePaths["aadhaarCard"]?.[0] || prevAadhaar.cardPath || null,
    };

    // GST Details
    const prevGst = typeof vendor.gstDetails?.toObject === "function"
      ? vendor.gstDetails.toObject()
      : { ...(vendor.gstDetails || {}) };
    const isGstReg = validated.value.gstRegistered !== undefined
      ? validated.value.gstRegistered
      : (prevGst.isRegistered ?? false);
    vendor.gstDetails = {
      ...prevGst,
      isRegistered: isGstReg,
      gstNumber: validated.value.gstNumber || prevGst.gstNumber || null,
      fullName: validated.value.gstFullName || prevGst.fullName || null,
      businessAddress: validated.value.registeredBusinessAddress || prevGst.businessAddress || null,
      certificateUrl: fileUrls["gstCertificate"]?.[0] || prevGst.certificateUrl || null,
      certificatePath: filePaths["gstCertificate"]?.[0] || prevGst.certificatePath || null,
    };
    vendor.gstRegistered = isGstReg;
    if (validated.value.gstNumber) vendor.gstNumber = validated.value.gstNumber;
    if (validated.value.gstFullName) vendor.gstFullName = validated.value.gstFullName;
    if (validated.value.registeredBusinessAddress) vendor.registeredBusinessAddress = validated.value.registeredBusinessAddress;
    if (validated.value.tradeLicenseNumber) vendor.tradeLicenseNumber = validated.value.tradeLicenseNumber;

    // Bank Details
    const prevBank = typeof vendor.bankDetails?.toObject === "function"
      ? vendor.bankDetails.toObject()
      : { ...(vendor.bankDetails || {}) };
    vendor.bankDetails = {
      ...prevBank,
      accountNumber: validated.value.bankAccountNumber || prevBank.accountNumber || null,
      ifscCode: validated.value.ifscCode || prevBank.ifscCode || null,
      accountType: validated.value.accountType || prevBank.accountType || null,
    };
    if (validated.value.bankAccountNumber) vendor.bankAccountNumber = validated.value.bankAccountNumber;
    if (validated.value.ifscCode) vendor.ifscCode = validated.value.ifscCode;
    if (validated.value.accountType) vendor.accountType = validated.value.accountType;

    // 2. Role-specific nested objects
    if (type === "restaurant") {
      const prevRest = typeof vendor.restaurantDetails?.toObject === "function"
        ? vendor.restaurantDetails.toObject()
        : { ...(vendor.restaurantDetails || {}) };
      vendor.restaurantDetails = {
        ...prevRest,
        restaurantName: validated.value.restaurantName || prevRest.restaurantName || null,
        fssaiNumber: validated.value.fssaiNumber || validated.value.fssaiLicenseNumber || prevRest.fssaiNumber || null,
        fssaiLicenseNumber: validated.value.fssaiLicenseNumber || validated.value.fssaiNumber || prevRest.fssaiLicenseNumber || null,
        cuisineTypes: validated.value.cuisineTypes || prevRest.cuisineTypes || [],
        costForTwo: validated.value.costForTwo !== undefined ? validated.value.costForTwo : prevRest.costForTwo,
        diningAvailable: validated.value.diningAvailable !== undefined ? validated.value.diningAvailable : prevRest.diningAvailable,
        photos: {
          menuCard: fileUrls["menuCard"] || fileUrls["menuPhotos"] || prevRest.photos?.menuCard || [],
          outletPhotos: fileUrls["outletPhotos"] || fileUrls["storefrontPhotos"] || prevRest.photos?.outletPhotos || [],
          storefrontPhotos: fileUrls["storefrontPhotos"] || fileUrls["outletPhotos"] || prevRest.photos?.storefrontPhotos || [],
          fssaiCertificate: fileUrls["fssaiCertificate"]?.[0] || prevRest.photos?.fssaiCertificate || null,
        },
      };
    } else if (type === "mechanic") {
      const prevMech = typeof vendor.mechanicDetails?.toObject === "function"
        ? vendor.mechanicDetails.toObject()
        : { ...(vendor.mechanicDetails || {}) };
      const mechTiming = validated.value.timing || {
        openTime: validated.value.openTime || prevMech.timing?.openTime || null,
        closeTime: validated.value.closeTime || prevMech.timing?.closeTime || null,
        openDays: validated.value.openDays || prevMech.timing?.openDays || [],
      };
      vendor.mechanicDetails = {
        ...prevMech,
        productCategoryId: validated.value.productCategoryId || validated.value.categoryId || prevMech.productCategoryId || null,
        productCategory: validated.value.productCategory || prevMech.productCategory || null,
        mechanicName: validated.value.mechanicName || validated.value.garageName || prevMech.mechanicName || null,
        garageName: validated.value.garageName || validated.value.mechanicName || prevMech.garageName || null,
        servicesOffered: validated.value.servicesOffered || validated.value.serviceCategories || prevMech.servicesOffered || [],
        supportedVehicles: validated.value.supportedVehicles || prevMech.supportedVehicles || [],
        serviceCategories: validated.value.serviceCategories || validated.value.servicesOffered || prevMech.serviceCategories || [],
        yearsExperience: validated.value.yearsExperience !== undefined ? validated.value.yearsExperience : prevMech.yearsExperience,
        timing: mechTiming,
        deviceType: validated.value.deviceType || prevMech.deviceType || "MetKart Mechanic Partner App",
        licenseDetails: {
          isRegistered: validated.value.licenseRegistered ?? validated.value.tradeLicenseRegistered ?? prevMech.licenseDetails?.isRegistered ?? false,
          licenseNumber: validated.value.tradeLicenseNumber || prevMech.licenseDetails?.licenseNumber || null,
          licenseUrl: fileUrls["tradeLicense"]?.[0] || prevMech.licenseDetails?.licenseUrl || null,
          licensePath: filePaths["tradeLicense"]?.[0] || prevMech.licenseDetails?.licensePath || null,
        },
        photos: {
          workshopFront: fileUrls["workshopFront"]?.[0] || fileUrls["storefrontPhotos"]?.[0] || prevMech.photos?.workshopFront || null,
          menuCard: fileUrls["menuCard"]?.[0] || prevMech.photos?.menuCard || null,
          menuSpreadsheet: fileUrls["menuSpreadsheet"]?.[0] || prevMech.photos?.menuSpreadsheet || null,
          tradeLicense: fileUrls["tradeLicense"]?.[0] || prevMech.photos?.tradeLicense || null,
        },
      };
    } else if (type === "shopkeeper") {
      const prevShop = typeof vendor.shopkeeperDetails?.toObject === "function"
        ? vendor.shopkeeperDetails.toObject()
        : { ...(vendor.shopkeeperDetails || {}) };
      vendor.shopkeeperDetails = {
        ...prevShop,
        productCategoryId: validated.value.productCategoryId || validated.value.categoryId || prevShop.productCategoryId || null,
        productCategory: validated.value.productCategory || prevShop.productCategory || null,
        shopkeeperName: validated.value.shopkeeperName || validated.value.shopName || prevShop.shopkeeperName || null,
        shopName: validated.value.shopName || validated.value.shopkeeperName || prevShop.shopName || null,
        photos: {
          storefrontPhotos: fileUrls["storefrontPhotos"] || prevShop.photos?.storefrontPhotos || [],
          panCard: fileUrls["panCard"]?.[0] || prevShop.photos?.panCard || null,
          gstCertificate: fileUrls["gstCertificate"]?.[0] || prevShop.photos?.gstCertificate || null,
        },
      };
      vendor.userDetails = { ...vendor.shopkeeperDetails };
    } else if (type === "scrapVendor") {
      const prevScrap = typeof vendor.scrapVendorDetails?.toObject === "function"
        ? vendor.scrapVendorDetails.toObject()
        : { ...(vendor.scrapVendorDetails || {}) };
      vendor.scrapVendorDetails = {
        ...prevScrap,
        businessName: validated.value.businessName || validated.value.scrapVendorName || prevScrap.businessName || null,
        scrapVendorName: validated.value.scrapVendorName || validated.value.businessName || prevScrap.scrapVendorName || null,
        scrapCategories: validated.value.scrapCategories || prevScrap.scrapCategories || [],
        pickupAvailable: validated.value.pickupAvailable ?? prevScrap.pickupAvailable ?? false,
      };
    } else if (type === "user") {
      const prevUser = typeof vendor.userDetails?.toObject === "function"
        ? vendor.userDetails.toObject()
        : { ...(vendor.userDetails || {}) };
      vendor.userDetails = {
        ...prevUser,
        ...validated.value,
      };
    }

    // 3. Mirror into existing onboardingData for backward compatibility
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

    vendor.onboardingData = form;
    vendor.onboardingFiles = mergedFiles;
    if (vendor.onboardingStatus !== "approved") {
      vendor.onboardingStatus = submit ? "submitted" : "draft";
    }
    vendor.isProfileComplete = submit || Boolean(vendor.isProfileComplete);
    await vendor.save();
    saved = true;

    const replacedPaths = new Set(
      currentFiles
        .filter((file) => replacedFields.has(file.fieldName))
        .map((file) => path.resolve(process.cwd(), file.path))
    );
    for (const oldPath of replacedPaths) removeFile(oldPath);

    const isApproved = vendor.onboardingStatus === "approved";
    return res.status(200).json({
      success: true,
      message: isApproved
        ? "Onboarding updated"
        : (submit ? "Onboarding submitted for review" : "Onboarding draft saved"),
      data: {
        id: String(vendor._id),
        vendorId: String(vendor._id),
        type,
        roleType: vendor.roleType,
        status: approvalStatus(vendor.onboardingStatus),
        onboardingStatus: vendor.onboardingStatus,
        isProfileComplete: vendor.isProfileComplete,
        form,
        location: vendor.location,
        panDetails: vendor.panDetails,
        aadhaarDetails: vendor.aadhaarDetails,
        gstDetails: vendor.gstDetails,
        bankDetails: vendor.bankDetails,
        restaurantDetails: vendor.restaurantDetails,
        mechanicDetails: vendor.mechanicDetails,
        shopkeeperDetails: vendor.shopkeeperDetails,
        userDetails: vendor.userDetails,
        scrapVendorDetails: vendor.scrapVendorDetails,
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
