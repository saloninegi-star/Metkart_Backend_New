const asyncHandler = require("../../utils/async-handler");
const { validateCredentials } = require("./auth.validation");
const {
  registerAccount,
  authenticateAccount,
  createAccessToken,
} = require("./auth.service");
const ApiError = require("../../utils/ApiError");

function createAuthController(config) {
  const register = asyncHandler(async (req, res) => {
    const { errors, value } = validateCredentials(req.body, { registration: true });
    if (errors.length) {
      throw new ApiError(400, "Invalid registration details", errors);
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
    const token = createAccessToken(account, config);
    return res.json({
      success: true,
      data: { account: account.toSafeJSON(), token },
    });
  });

  return { register, login };
}

module.exports = createAuthController;
