const asyncHandler = require("../../utils/async-handler");
const ApiError = require("../../utils/ApiError");
const {
  registerAccount,
  authenticateAccount,
  changeAccountPassword,
  createAccessToken,
} = require("../auth/auth.service");
const { validateCredentials } = require("../auth/auth.validation");
const {
  validateVendorRegistration,
  validateVendorProfileUpdate,
  validatePasswordChange,
} = require("./vendor.validation");

function createVendorController(config) {
  const register = asyncHandler(async (req, res) => {
    const { errors, value } = validateVendorRegistration(req.body);
    if (errors.length) {
      throw new ApiError(400, "Invalid vendor registration details", errors);
    }

    const account = await registerAccount(value);
    const token = createAccessToken(account, config);
    return res.status(201).json({
      success: true,
      data: { account: account.toSafeJSON(), token },
    });
  });

  const login = asyncHandler(async (req, res) => {
    const { errors, value } = validateCredentials(req.body);
    if (errors.length) {
      throw new ApiError(400, "Invalid login details", errors);
    }

    const account = await authenticateAccount(value);
    if (account.role !== "vendor") {
      throw new ApiError(403, "This account cannot sign in to the vendor app");
    }

    const token = createAccessToken(account, config);
    return res.json({
      success: true,
      data: { account: account.toSafeJSON(), token },
    });
  });

  const getProfile = asyncHandler(async (req, res) => {
    return res.json({
      success: true,
      data: { profile: req.account.toSafeJSON() },
    });
  });

  const updateProfile = asyncHandler(async (req, res) => {
    const { errors, value } = validateVendorProfileUpdate(req.body);
    if (errors.length) {
      throw new ApiError(400, "Invalid vendor profile details", errors);
    }

    if (value.name !== undefined) req.account.name = value.name;
    if (value.businessName !== undefined) {
      req.account.set("vendorProfile.businessName", value.businessName);
    }
    if (value.phone !== undefined) req.account.set("vendorProfile.phone", value.phone);
    if (value.address !== undefined) {
      for (const [field, fieldValue] of Object.entries(value.address)) {
        req.account.set(`vendorProfile.address.${field}`, fieldValue);
      }
    }

    await req.account.save();
    return res.json({
      success: true,
      data: { profile: req.account.toSafeJSON() },
    });
  });

  const updatePassword = asyncHandler(async (req, res) => {
    const { errors, value } = validatePasswordChange(req.body);
    if (errors.length) {
      throw new ApiError(400, "Invalid password change details", errors);
    }

    await changeAccountPassword(req.account.id, value.currentPassword, value.newPassword);
    return res.json({
      success: true,
      data: { message: "Password updated; sign in again with your new password" },
    });
  });

  return { register, login, getProfile, updateProfile, updatePassword };
}

module.exports = createVendorController;
