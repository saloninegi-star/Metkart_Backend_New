const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Account = require("../accounts/account.model");
const ApiError = require("../../utils/ApiError");

async function registerAccount({ name, email, password, role, vendorProfile }) {
  const existing = await Account.exists({ email });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const account = await Account.create({
    name,
    email,
    passwordHash,
    role,
    ...(vendorProfile ? { vendorProfile } : {}),
  });
  return account;
}

async function authenticateAccount({ email, password }) {
  const account = await Account.findOne({ email }).select("+passwordHash");
  if (!account || !(await account.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password");
  }
  return account;
}

async function changeAccountPassword(accountId, currentPassword, newPassword) {
  const account = await Account.findById(accountId).select("+passwordHash");
  if (!account || !(await account.comparePassword(currentPassword))) {
    throw new ApiError(400, "Current password is incorrect");
  }

  account.passwordHash = await bcrypt.hash(newPassword, 12);
  account.tokenVersion += 1;
  await account.save();
}

function createAccessToken(account, { jwtSecret, jwtExpiresIn }) {
  return jwt.sign({ role: account.role, tokenVersion: account.tokenVersion || 0 }, jwtSecret, {
    subject: account.id,
    expiresIn: jwtExpiresIn,
  });
}

module.exports = {
  registerAccount,
  authenticateAccount,
  changeAccountPassword,
  createAccessToken,
};
