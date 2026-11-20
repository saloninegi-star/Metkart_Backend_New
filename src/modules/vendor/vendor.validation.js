const { validateCredentials } = require("../auth/auth.validation");

const ADDRESS_FIELDS = ["street", "city", "state", "postalCode", "country"];
const PROFILE_FIELDS = ["name", "businessName", "phone", "address"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateVendorRegistration(body) {
  const input = isRecord(body) ? body : {};
  const credentials = validateCredentials(
    { ...input, role: "food" },
    { registration: true }
  );
  const errors = [...credentials.errors];
  const businessName =
    typeof input.businessName === "string" ? input.businessName.trim() : "";

  if (!businessName || businessName.length > 120) {
    errors.push("Business name is required and must be at most 120 characters");
  }

  const phone = input.phone === undefined ? "" : input.phone;
  if (typeof phone !== "string" || phone.trim().length > 30) {
    errors.push("Phone must be a string of at most 30 characters");
  }

  return {
    errors,
    value: {
      name: credentials.value.name,
      email: credentials.value.email,
      password: credentials.value.password,
      role: "vendor",
      vendorProfile: { businessName, phone: typeof phone === "string" ? phone.trim() : "" },
    },
  };
}

function validateVendorProfileUpdate(body) {
  if (!isRecord(body)) {
    return { errors: ["A JSON object is required"], value: {} };
  }

  const errors = [];
  const value = {};
  const unknownFields = Object.keys(body).filter((key) => !PROFILE_FIELDS.includes(key));
  if (unknownFields.length) {
    errors.push(`Unsupported profile fields: ${unknownFields.join(", ")}`);
  }

  if (Object.hasOwn(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      errors.push("Name is required and must be at most 100 characters");
    } else {
      value.name = body.name.trim();
    }
  }

  if (Object.hasOwn(body, "businessName")) {
    if (
      typeof body.businessName !== "string" ||
      !body.businessName.trim() ||
      body.businessName.trim().length > 120
    ) {
      errors.push("Business name is required and must be at most 120 characters");
    } else {
      value.businessName = body.businessName.trim();
    }
  }

  if (Object.hasOwn(body, "phone")) {
    if (typeof body.phone !== "string" || body.phone.trim().length > 30) {
      errors.push("Phone must be a string of at most 30 characters");
    } else {
      value.phone = body.phone.trim();
    }
  }

  if (Object.hasOwn(body, "address")) {
    if (!isRecord(body.address)) {
      errors.push("Address must be an object");
    } else {
      const unknownAddressFields = Object.keys(body.address).filter(
        (key) => !ADDRESS_FIELDS.includes(key)
      );
      if (unknownAddressFields.length) {
        errors.push(`Unsupported address fields: ${unknownAddressFields.join(", ")}`);
      }

      const address = {};
      for (const field of ADDRESS_FIELDS) {
        if (!Object.hasOwn(body.address, field)) continue;
        const fieldValue = body.address[field];
        if (typeof fieldValue !== "string" || fieldValue.trim().length > 160) {
          errors.push(`Address ${field} must be a string of at most 160 characters`);
        } else {
          address[field] = fieldValue.trim();
        }
      }
      value.address = address;
    }
  }

  if (!Object.keys(value).length && !errors.length) {
    errors.push("At least one profile field is required");
  }

  return { errors, value };
}

function validatePasswordChange(body) {
  const input = isRecord(body) ? body : {};
  const errors = [];
  const currentPassword =
    typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";

  if (!currentPassword) errors.push("Current password is required");
  if (newPassword.length < 8) errors.push("New password must be at least 8 characters");
  if (currentPassword && newPassword === currentPassword) {
    errors.push("New password must be different from the current password");
  }

  return { errors, value: { currentPassword, newPassword } };
}

module.exports = {
  validateVendorRegistration,
  validateVendorProfileUpdate,
  validatePasswordChange,
};
