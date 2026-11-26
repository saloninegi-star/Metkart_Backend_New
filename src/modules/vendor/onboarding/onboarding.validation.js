const mongoose = require("mongoose");

const sharedKeys = [
  "vendorId",
  "roleType",
  "onboardingType",
  "businessTypeId",
  "shopTypeId",
  "categoryId",
  "productCategory",
  "productCategoryId",
  "ownerFullName",
  "fullName",
  "email",
  "emailAddress",
  "mobileNumber",
  "whatsappUpdates",
  "primaryContactSameAsOwner",
  "primaryContactNumber",
  "location",
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
  "panNumber",
  "panFullName",
  "panAddress",
  "aadhaarNumber",
  "aadhaarFullName",
  "aadhaarAddress",
  "gstRegistered",
  "gstNumber",
  "gstFullName",
  "registeredBusinessAddress",
  "licenseRegistered",
  "tradeLicenseRegistered",
  "tradeLicenseNumber",
  "bankAccountNumber",
  "bankAccountNumberConfirm",
  "ifscCode",
  "accountType",
  "termsAccepted",
];

const roleSchemas = {
  shopkeeper: {
    keys: ["shopkeeperName", "shopName"],
    required: ["shopkeeperName"],
    businessName: "shopkeeperName",
  },
  restaurant: {
    keys: [
      "restaurantName",
      "cuisineTypes",
      "fssaiNumber",
      "fssaiLicenseNumber",
      "costForTwo",
      "diningAvailable",
    ],
    required: ["restaurantName", "cuisineTypes", "fssaiNumber"],
    businessName: "restaurantName",
  },
  mechanic: {
    keys: [
      "garageName",
      "mechanicName",
      "servicesOffered",
      "supportedVehicles",
      "serviceCategories",
      "yearsExperience",
      "timing",
      "openTime",
      "closeTime",
      "openDays",
      "deviceType",
    ],
    required: ["garageName"],
    businessName: "garageName",
  },
  scrapVendor: {
    keys: ["businessName", "scrapVendorName", "scrapCategories", "pickupAvailable"],
    required: ["businessName", "scrapCategories", "pickupAvailable"],
    businessName: "businessName",
  },
  user: {
    keys: ["name", "profileName", "preferences"],
    required: [],
    businessName: "name",
  },
};

const requiredFiles = ["panCard", "aadhaarCard", "storefrontPhotos"];
const allowedFileFields = [
  ...requiredFiles,
  "gstCertificate",
  "tradeLicense",
  "bankProof",
];

const extendedFileFields = [
  ...allowedFileFields,
  "fssaiCertificate",
  "fssaiLicense",
  "menuCard",
  "menuPhotos",
  "outletPhotos",
  "cancelledCheque",
  "workshopFront",
  "menuSpreadsheet",
];

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validPhone = /^\+?[0-9\s()-]{8,20}$/;
const validPan = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const validIfsc = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateOnboardingData(type, data, files, requireComplete) {
  const errors = [];
  const schema = roleSchemas[type];

  if (!schema) {
    return { errors: [`Unsupported onboarding type: ${type}`], value: {} };
  }
  if (!isPlainObject(data)) {
    return { errors: ["data must be a JSON object"], value: {} };
  }

  const allowedKeys = new Set([...sharedKeys, ...schema.keys]);
  const unknownKeys = Object.keys(data).filter(
    (key) => !allowedKeys.has(key) || key === "__proto__"
  );
  if (unknownKeys.length) {
    errors.push(`Unsupported ${type} fields: ${unknownKeys.join(", ")}`);
  }

  const value = {};
  for (const [key, fieldValue] of Object.entries(data)) {
    if (!allowedKeys.has(key)) continue;

    if (
      [
        "whatsappUpdates",
        "primaryContactSameAsOwner",
        "gstRegistered",
        "licenseRegistered",
        "tradeLicenseRegistered",
        "pickupAvailable",
        "diningAvailable",
        "termsAccepted",
      ].includes(key)
    ) {
      if (typeof fieldValue === "boolean") {
        value[key] = fieldValue;
      } else if (
        typeof fieldValue === "string" &&
        ["true", "false", "yes", "no", "1", "0"].includes(fieldValue.trim().toLowerCase())
      ) {
        const lower = fieldValue.trim().toLowerCase();
        value[key] = lower === "true" || lower === "yes" || lower === "1";
      } else {
        errors.push(`${key} must be a boolean`);
      }
    } else if (key === "location") {
      if (!isPlainObject(fieldValue)) {
        errors.push("location must be an object");
      } else {
        const locationKeys = new Set([
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
        ]);
        const unknownLocationKeys = Object.keys(fieldValue).filter(
          (locationKey) => !locationKeys.has(locationKey)
        );
        if (unknownLocationKeys.length) {
          errors.push(`Unsupported location fields: ${unknownLocationKeys.join(", ")}`);
        }
        value.location = {};
        for (const [locationKey, locationValue] of Object.entries(fieldValue)) {
          if (!locationKeys.has(locationKey)) continue;
          if (["latitude", "longitude"].includes(locationKey)) {
            const coordinate =
              typeof locationValue === "string" && locationValue.trim() !== ""
                ? Number(locationValue)
                : locationValue;
            if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
              errors.push(`location.${locationKey} must be a valid number`);
            } else {
              value.location[locationKey] = coordinate;
            }
          } else if (typeof locationValue === "string") {
            value.location[locationKey] = locationValue.trim();
          } else {
            errors.push(`location.${locationKey} must be a string`);
          }
        }
        if (!value.location.area && (value.location.sector || value.location.locality)) {
          value.location.area = value.location.sector || value.location.locality;
        }
        if (!value.location.shopNo && value.location.buildingNo) {
          value.location.shopNo = value.location.buildingNo;
        }
        if (!value.location.floor && value.location.town) {
          value.location.floor = value.location.town;
        }
        if (!value.location.nearbyLandmark && value.location.landmark) {
          value.location.nearbyLandmark = value.location.landmark;
        }
      }
    } else if (
      [
        "cuisineTypes",
        "serviceCategories",
        "scrapCategories",
        "servicesOffered",
        "supportedVehicles",
        "openDays",
      ].includes(key)
    ) {
      let arrayValue = fieldValue;
      if (typeof fieldValue === "string") {
        try {
          arrayValue = JSON.parse(fieldValue);
        } catch {
          arrayValue = fieldValue.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
      if (!Array.isArray(arrayValue) || arrayValue.some((item) => typeof item !== "string")) {
        errors.push(`${key} must be an array of strings`);
      } else {
        value[key] = arrayValue.map((item) => item.trim()).filter(Boolean);
      }
    } else if (key === "timing") {
      let timingObj = fieldValue;
      if (typeof fieldValue === "string") {
        try {
          timingObj = JSON.parse(fieldValue);
        } catch {
          timingObj = {};
        }
      }
      if (isPlainObject(timingObj)) {
        value.timing = {
          openTime: typeof timingObj.openTime === "string" ? timingObj.openTime.trim() : "",
          closeTime: typeof timingObj.closeTime === "string" ? timingObj.closeTime.trim() : "",
          openDays: Array.isArray(timingObj.openDays)
            ? timingObj.openDays.map((d) => String(d).trim()).filter(Boolean)
            : [],
        };
      }
    } else if (key === "yearsExperience") {
      const yearsExperience =
        typeof fieldValue === "string" && fieldValue.trim() !== ""
          ? Number(fieldValue)
          : fieldValue;
      if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 100) {
        errors.push("yearsExperience must be an integer from 0 to 100");
      } else {
        value[key] = yearsExperience;
      }
    } else if (key === "costForTwo") {
      const cost =
        typeof fieldValue === "string" && fieldValue.trim() !== ""
          ? Number(fieldValue)
          : fieldValue;
      if (typeof cost !== "number" || Number.isNaN(cost) || cost < 0) {
        errors.push("costForTwo must be a positive number");
      } else {
        value[key] = cost;
      }
    } else if (["latitude", "longitude"].includes(key)) {
      const coordinate =
        typeof fieldValue === "string" && fieldValue.trim() !== ""
          ? Number(fieldValue)
          : fieldValue;
      if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
        errors.push(`${key} must be a valid number`);
      } else {
        value[key] = coordinate;
      }
    } else if (typeof fieldValue === "string") {
      value[key] = fieldValue.trim();
    } else if (fieldValue === null || typeof fieldValue === "number") {
      errors.push(`${key} must be a string`);
    } else if (isPlainObject(fieldValue) || Array.isArray(fieldValue)) {
      errors.push(`${key} must be a string`);
    } else {
      value[key] = String(fieldValue).trim();
    }
  }

  // Alias synchronization
  if (value.fullName && !value.ownerFullName) {
    value.ownerFullName = value.fullName;
  }
  if (value.ownerFullName && !value.fullName) {
    value.fullName = value.ownerFullName;
  }
  if (value.emailAddress && !value.email) {
    value.email = value.emailAddress;
  }
  if (type === "mechanic") {
    if (value.mechanicName && !value.garageName) {
      value.garageName = value.mechanicName;
    }
    if (value.garageName && !value.mechanicName) {
      value.mechanicName = value.garageName;
    }
    if (value.servicesOffered && !value.serviceCategories) {
      value.serviceCategories = value.servicesOffered;
    }
    if (value.serviceCategories && !value.servicesOffered) {
      value.servicesOffered = value.serviceCategories;
    }
    if (value.openTime || value.closeTime || value.openDays) {
      value.timing = {
        openTime: value.openTime || value.timing?.openTime || "",
        closeTime: value.closeTime || value.timing?.closeTime || "",
        openDays: value.openDays || value.timing?.openDays || [],
      };
    }
    if (value.yearsExperience === undefined) {
      value.yearsExperience = 0;
    }
  }
  if (type === "shopkeeper") {
    if (value.shopkeeperName && !value.shopName) {
      value.shopName = value.shopkeeperName;
    }
    if (value.shopName && !value.shopkeeperName) {
      value.shopkeeperName = value.shopName;
    }
  }
  if (type === "scrapVendor" && value.scrapVendorName && !value.businessName) {
    value.businessName = value.scrapVendorName;
  }
  if (type === "restaurant" && value.fssaiLicenseNumber && !value.fssaiNumber) {
    value.fssaiNumber = value.fssaiLicenseNumber;
  }

  const normalizedFiles = { ...(files || {}) };
  if (normalizedFiles.outletPhotos) normalizedFiles.storefrontPhotos = true;
  if (normalizedFiles.workshopFront) normalizedFiles.storefrontPhotos = true;
  if (normalizedFiles.cancelledCheque) normalizedFiles.bankProof = true;
  if (normalizedFiles.fssaiLicense) normalizedFiles.fssaiCertificate = true;
  if (normalizedFiles.menuPhotos) normalizedFiles.menuCard = true;
  if (normalizedFiles.menuSpreadsheet) normalizedFiles.menuCard = true;

  if (value.email && !validEmail.test(value.email)) {
    errors.push("email must be a valid email address");
  }
  if (value.mobileNumber && !validPhone.test(value.mobileNumber)) {
    errors.push("mobileNumber must be a valid phone number");
  }
  if (value.primaryContactNumber && !validPhone.test(value.primaryContactNumber)) {
    errors.push("primaryContactNumber must be a valid phone number");
  }
  if (value.panNumber && !validPan.test(value.panNumber)) {
    errors.push("panNumber must be a valid PAN number");
  }
  if (value.ifscCode && !validIfsc.test(value.ifscCode)) {
    errors.push("ifscCode must be a valid IFSC code");
  }
  for (const key of ["vendorId", "businessTypeId", "shopTypeId", "categoryId", "productCategoryId"]) {
    if (value[key] && !mongoose.Types.ObjectId.isValid(value[key])) {
      errors.push(`${key} must be a valid ID`);
    }
  }

  if (requireComplete) {
    const requiredKeys = [
      ...schema.required,
      "vendorId",
      "businessTypeId",
      "shopTypeId",
      "categoryId",
      "ownerFullName",
      "email",
      "mobileNumber",
      "location",
      "panNumber",
      "panFullName",
      "gstRegistered",
      "bankAccountNumber",
      "bankAccountNumberConfirm",
      "ifscCode",
      "accountType",
    ];
    for (const key of requiredKeys) {
      if (value[key] === undefined || value[key] === "") {
        errors.push(`${key} is required`);
      }
    }
    for (const key of ["ownerFullName", "panFullName", schema.businessName]) {
      if (value[key] && typeof value[key] === "string" && value[key].length > 120) {
        errors.push(`${key} must be 120 characters or fewer`);
      }
    }
    if (value.location) {
      if (!value.location.area) errors.push("location.area is required");
      if (!value.location.city) errors.push("location.city is required");
    }
    if (value.primaryContactSameAsOwner === false && !value.primaryContactNumber) {
      errors.push("primaryContactNumber is required when it differs from the owner's number");
    }
    if (value.bankAccountNumber !== value.bankAccountNumberConfirm) {
      errors.push("Bank account numbers do not match");
    }
    if (value.gstRegistered === true) {
      for (const key of ["gstNumber", "gstFullName", "registeredBusinessAddress"]) {
        if (!value[key]) errors.push(`${key} is required when GST is registered`);
      }
      if (!normalizedFiles.gstCertificate) errors.push("gstCertificate file is required");
    } else if (
      !value.tradeLicenseNumber &&
      !normalizedFiles.tradeLicense &&
      value.licenseRegistered !== false &&
      value.tradeLicenseRegistered !== false
    ) {
      errors.push("tradeLicenseNumber or tradeLicense file is required when GST is not registered");
    }
    for (const key of ["panCard", "aadhaarCard", "storefrontPhotos"]) {
      if (!normalizedFiles[key]) errors.push(`${key} file is required`);
    }
    for (const key of ["cuisineTypes", "serviceCategories", "scrapCategories", "servicesOffered"]) {
      if (value[key] && value[key].length === 0) {
        errors.push(`${key} must contain at least one item`);
      }
    }
  }

  if (
    value.bankAccountNumberConfirm !== undefined &&
    value.bankAccountNumber !== undefined &&
    value.bankAccountNumber !== value.bankAccountNumberConfirm
  ) {
    errors.push("Bank account numbers do not match");
  }

  delete value.bankAccountNumberConfirm;
  return { errors: [...new Set(errors)], value };
}

module.exports = {
  allowedFileFields,
  extendedFileFields,
  roleSchemas,
  validateOnboardingData,
};
