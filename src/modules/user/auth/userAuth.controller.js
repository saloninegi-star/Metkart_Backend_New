const bcrypt = require('bcryptjs');
const User = require('./user.model');
const {
  DUMMY_OTP,
  isProductionEnv,
  normalizeEmail,
  isValidEmail,
  isValidPhone,
  buildLockPayload,
  checkAndClearOtpLock,
  signRoleToken,
  getAccountRestrictionError,
  findOneByEmailWithPassword,
  issueAndSendOtp,
  validateAndConsumeOtp,
  authenticateWithPassword,
} = require('../../../utils/otpAuth');

function buildUserSummary(user) {
  const emailVerified = Boolean(user.isVerified || user.isEmailVerified);
  return {
    id: user._id,
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    mobileNumber: user.mobileNumber,
    currentAddress: user.currentAddress,
    isVerified: emailVerified,
    isEmailVerified: emailVerified,
  };
}

/**
 * @desc    Register user with fullName, email, mobileNumber, currentAddress & password, then send OTP
 * @route   POST /api/user/auth/register
 */
const registerUser = async (req, res) => {
  try {
    const { fullName, email, mobileNumber, currentAddress, password } = req.body || {};

    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
    const normalizedEmail = normalizeEmail(email);
    const trimmedMobile = typeof mobileNumber === 'string' ? mobileNumber.trim() : '';
    const trimmedAddress = typeof currentAddress === 'string' ? currentAddress.trim() : '';

    if (!trimmedName || !normalizedEmail || !trimmedMobile || !trimmedAddress || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'fullName, email, mobileNumber, currentAddress, and password are required.',
      });
    }

    if (trimmedName.length > 120) {
      return res.status(400).json({
        success: false,
        message: 'fullName must be at most 120 characters.',
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    if (!isValidPhone(trimmedMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid mobileNumber.',
      });
    }

    if (trimmedAddress.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'currentAddress must be at most 500 characters.',
      });
    }

    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: 'Password must be between 6 and 72 characters.',
      });
    }

    let user = await findOneByEmailWithPassword(User, normalizedEmail);

    const restriction = getAccountRestrictionError(user, 'User');
    if (restriction) {
      return res.status(restriction.status).json({
        success: false,
        message: restriction.message,
      });
    }

    const now = new Date();
    if (user) {
      const lockStatus = checkAndClearOtpLock(user, now);
      if (lockStatus.locked) {
        return res.status(429).json(buildLockPayload(lockStatus.lockedUntil, now));
      }

      if ((user.isVerified || user.isEmailVerified) && user.passwordHash) {
        return res.status(409).json({
          success: false,
          message: 'User already registered with this email. Please login with email and password.',
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const isNew = !user;

    if (!user) {
      user = new User({
        fullName: trimmedName,
        email: normalizedEmail,
        mobileNumber: trimmedMobile,
        currentAddress: trimmedAddress,
        passwordHash,
        isVerified: false,
        isEmailVerified: false,
        otpAttempts: 0,
        otpLockedUntil: null,
      });
    } else {
      user.fullName = trimmedName;
      user.mobileNumber = trimmedMobile;
      user.currentAddress = trimmedAddress;
      user.passwordHash = passwordHash;
      user.isVerified = false;
      user.isEmailVerified = false;
    }

    await issueAndSendOtp(user, { recipientName: user.fullName || 'User', now });

    return res.status(isNew ? 201 : 200).json({
      success: true,
      message: 'User registered successfully. OTP sent to your email.',
      ...(!isProductionEnv() ? { dummyOtp: DUMMY_OTP } : {}),
      user: buildUserSummary(user),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }
    console.error('User Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while registering user.',
      error: error.message,
    });
  }
};

/**
 * @desc    Login user with email and password
 * @route   POST /api/user/auth/login
 */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const authResult = await authenticateWithPassword({
      Model: User,
      email,
      password,
      entityLabel: 'User',
      isVerifiedFn: (user) => Boolean(user.isVerified || user.isEmailVerified),
      noPasswordMessage: 'Password is not set for this account. Please register with a password.',
    });

    if (!authResult.ok) {
      return res.status(authResult.status).json(authResult.body);
    }

    const user = authResult.record;
    const token = signRoleToken(user, 'user');

    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error('User Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while logging in.',
      error: error.message,
    });
  }
};

/**
 * @desc    Send or Resend OTP to registered user email (respects 24h lockout)
 * @route   POST /api/user/auth/send-otp
 * @route   POST /api/user/auth/resend-otp
 */
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Please register first.',
      });
    }

    const restriction = getAccountRestrictionError(user, 'User');
    if (restriction) {
      return res.status(restriction.status).json({
        success: false,
        message: restriction.message,
      });
    }

    const now = new Date();
    const lockStatus = checkAndClearOtpLock(user, now);
    if (lockStatus.locked) {
      return res.status(429).json(buildLockPayload(lockStatus.lockedUntil, now));
    }

    await issueAndSendOtp(user, { recipientName: user.fullName || 'User', now });

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully to your email.',
      ...(!isProductionEnv() ? { dummyOtp: DUMMY_OTP } : {}),
    });
  } catch (error) {
    console.error('User Send/Resend OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while sending OTP.',
      error: error.message,
    });
  }
};

/**
 * @desc    Verify 6-digit email OTP (enforces 3 wrong attempts -> 24-hour lockout)
 * @route   POST /api/user/auth/verify-otp
 */
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = otp !== undefined && otp !== null ? String(otp).trim() : '';

    if (!normalizedEmail || !normalizedOtp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required.',
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found. Please register first.',
      });
    }

    const restriction = getAccountRestrictionError(user, 'User');
    if (restriction) {
      return res.status(restriction.status).json({
        success: false,
        message: restriction.message,
      });
    }

    const now = new Date();
    const otpResult = await validateAndConsumeOtp(user, normalizedOtp, now);
    if (!otpResult.ok) {
      return res.status(otpResult.status).json(otpResult.body);
    }

    user.isVerified = true;
    user.isEmailVerified = true;
    await user.save();

    const token = signRoleToken(user, 'user');

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      token,
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error('User Verify OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying OTP.',
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyOtp,
  sendOtp,
  resendOtp: sendOtp,
  buildUserSummary,
};
