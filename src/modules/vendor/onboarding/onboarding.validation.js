const mongoose = require("mongoose");

const sharedKeys = [
  "vendorId",
  "businessTypeId",
  "shopTypeId",
  "categoryId",
  "ownerFullName",
  "email",
  "mobileNumber",
  "whatsappUpdates",
  "primaryContactSameAsOwner",
  "primaryContactNumber",
  "location",
  "shopNo",
  "floor",
  "area",
  "city",
  "nearbyLandmark",
  "latitude",
  "longitude",
  "panNumber",
  "panFullName",
  "gstRegistered",
  "gstNumber",
  "gstFullName",
  "registeredBusinessAddress",
  "tradeLicenseNumber",
  "bankAccountNumber",
  "bankAccountNumberConfirm",
  "ifscCode",
  "accountType",
];

const roleSchemas = {
  shopkeeper: {
    keys: ["shopkeeperName"],
    required: ["shopkeeperName"],
    businessName: "shopkeeperName",
  },
  restaurant: {
    keys: ["restaurantName", "cuisineTypes", "fssaiNumber"],
    required: ["restaurantName", "cuisineTypes", "fssaiNumber"],
    businessName: "restaurantName",
  },
  mechanic: {
    keys: ["garageName", "serviceCategories", "yearsExperience"],
    required: ["garageName", "serviceCategories", "yearsExperience"],
    businessName: "garageName",
  },
  scrapVendor: {
    keys: ["businessName", "scrapCategories", "pickupAvailable"],
    required: ["businessName", "scrapCategories", "pickupAvailable"],
    businessName: "businessName",
  },
};

const requiredFiles = ["panCard", "aadhaarCard", "storefrontPhotos"];
const allowedFileFields = [
  ...requiredFiles,
  "gstCertificate",
  "tradeLicense",
  "bankProof",
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
      ["whatsappUpdates", "primaryContactSameAsOwner", "gstRegistered", "pickupAvailable"].includes(key)
    ) {
      if (typeof fieldValue === "boolean") {
        value[key] = fieldValue;
      } else if (typeof fieldValue === "string" && ["true", "false"].includes(fieldValue.trim().toLowerCase())) {
        value[key] = fieldValue.trim().toLowerCase() === "true";
      } else {
        errors.push(`${key} must be a boolean`);
      }
    } else if (key === "location") {
      if (!isPlainObject(fieldValue)) {
        errors.push("location must be an object");
      } else {
        const locationKeys = new Set([
          "shopNo",
          "floor",
          "area",
          "city",
          "nearbyLandmark",
          "latitude",
          "longitude",
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
      }
    } else if (["cuisineTypes", "serviceCategories", "scrapCategories"].includes(key)) {
      let arrayValue = fieldValue;
      if (typeof fieldValue === "string") {
        try {
          arrayValue = JSON.parse(fieldValue);
        } catch {
          arrayValue = null;
        }
      }
      if (!Array.isArray(arrayValue) || arrayValue.some((item) => typeof item !== "string")) {
        errors.push(`${key} must be an array of strings`);
      } else {
        value[key] = arrayValue.map((item) => item.trim()).filter(Boolean);
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
  for (const key of ["vendorId", "businessTypeId", "shopTypeId", "categoryId"]) {
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
      if (!files.gstCertificate) errors.push("gstCertificate file is required");
    } else if (!value.tradeLicenseNumber && !files.tradeLicense) {
      errors.push("tradeLicenseNumber or tradeLicense file is required when GST is not registered");
    }
    for (const key of ["panCard", "aadhaarCard", "storefrontPhotos"]) {
      if (!files[key]) errors.push(`${key} file is required`);
    }
    for (const key of ["cuisineTypes", "serviceCategories", "scrapCategories"]) {
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
  roleSchemas,
  validateOnboardingData,
};
