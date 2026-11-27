const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Vendor = require('./vendorAuth.model');
const mailer = require('../../../utils/mailer');

const DUMMY_OTP = '123456';
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;
const OTP_LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getJwtSecret() {
  return process.env.JWT_SECRET || 'your_metkart_jwt_secret_key';
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.toLowerCase().trim() : '';
}

function isValidEmail(email) {
  return Boolean(email && email.length <= 254 && EMAIL_REGEX.test(email));
}

function buildLockPayload(lockedUntil, now = new Date()) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)
  );
  return {
    success: false,
    message: 'Too many wrong OTP attempts. Please try again after 24 hours.',
    lockedUntil,
    retryAfterSeconds,
  };
}

/**
 * Check if the vendor is currently locked out from OTP verification/sending.
 * Automatically clears expired locks after 24 hours.
 */
function checkAndClearOtpLock(vendor, now = new Date()) {
  if (!vendor?.otpLockedUntil) {
    return { locked: false, unlocked: false };
  }

  const lockedUntilDate = new Date(vendor.otpLockedUntil);
  if (lockedUntilDate > now) {
    return { locked: true, lockedUntil: lockedUntilDate, unlocked: false };
  }

  // 24-hour lockout period has elapsed; reset attempt counters
  vendor.otpLockedUntil = null;
  vendor.otpAttempts = 0;
  return { locked: false, unlocked: true };
}

function buildVendorSummary(vendor) {
  return {
    id: vendor._id,
    email: vendor.email,
    isEmailVerified: vendor.isEmailVerified,
    isProfileComplete: vendor.isProfileComplete,
  };
}

async function issueAndSendOtp(vendor, now = new Date()) {
  vendor.otp = DUMMY_OTP;
  vendor.otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
  await vendor.save();

  const recipientName = vendor.ownerFullName || vendor.fullName || 'Vendor';
  try {
    await mailer.sendOtpEmail(vendor.email, DUMMY_OTP, recipientName);
  } catch (mailError) {
    // Keep dummy OTP flow working even if local SMTP credentials fail
    console.warn(`[MetKart] Email OTP delivery failed for ${vendor.email}: ${mailError.message}`);
  }
  console.log(`[MetKart] Dummy OTP for ${vendor.email} is: ${DUMMY_OTP}`);
}

/**
 * @desc    Register vendor with email and password, then send OTP via email
 * @route   POST /api/vendor/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, fullName, ownerFullName } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: 'Password must be between 6 and 72 characters.',
      });
    }

    const query = Vendor.findOne({ email: normalizedEmail });
    let vendor =
      typeof query?.select === 'function'
        ? await query.select('+passwordHash')
        : await query;

    if (vendor?.deletedAt) {
      return res.status(403).json({
        success: false,
        message: 'Vendor profile has been deleted.',
      });
    }

    const now = new Date();
    if (vendor) {
      const lockStatus = checkAndClearOtpLock(vendor, now);
      if (lockStatus.locked) {
        return res.status(429).json(buildLockPayload(lockStatus.lockedUntil, now));
      }

      if (vendor.isEmailVerified && vendor.passwordHash) {
        return res.status(409).json({
          success: false,
          message: 'Vendor already registered with this email. Please login with email and OTP.',
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const displayName =
      (typeof ownerFullName === 'string' && ownerFullName.trim()) ||
      (typeof fullName === 'string' && fullName.trim()) ||
      null;

    const isNew = !vendor;
    if (!vendor) {
      vendor = new Vendor({
        email: normalizedEmail,
        passwordHash,
        isEmailVerified: false,
        otpAttempts: 0,
        otpLockedUntil: null,
        ...(displayName ? { fullName: displayName, ownerFullName: displayName } : {}),
      });
    } else {
      vendor.passwordHash = passwordHash;
      if (displayName) {
        vendor.fullName = displayName;
        vendor.ownerFullName = displayName;
      }
      if (!vendor.isEmailVerified) {
        vendor.isEmailVerified = false;
      }
    }

    await issueAndSendOtp(vendor, now);

    return res.status(isNew ? 201 : 200).json({
      success: true,
      message: 'Vendor registered successfully. OTP sent to your email.',
      dummyOtp: DUMMY_OTP,
      vendor: buildVendorSummary(vendor),
    });
  } catch (error) {
    console.error('register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while registering vendor.',
      error: error.message,
    });
  }
};

/**
 * @desc    Send or Resend OTP to a registered vendor's email
 * @route   POST /api/vendor/auth/send-otp
 * @route   POST /api/vendor/auth/resend-otp
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const vendor = await Vendor.findOne({ email: normalizedEmail });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found. Please register with email and password first.',
      });
    }

    if (vendor.deletedAt) {
      return res.status(403).json({
        success: false,
        message: 'Vendor profile has been deleted.',
      });
    }

    const now = new Date();
    const lockStatus = checkAndClearOtpLock(vendor, now);
    if (lockStatus.locked) {
      return res.status(429).json(buildLockPayload(lockStatus.lockedUntil, now));
    }

    await issueAndSendOtp(vendor, now);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully to your email.',
      dummyOtp: DUMMY_OTP,
    });
  } catch (error) {
    console.error('sendOtp error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while sending OTP.',
      error: error.message,
    });
  }
};

/**
 * Shared handler for verifying OTP and logging the vendor in.
 * Enforces 3 wrong OTP attempts -> 24-hour lockout.
 */
async function verifyOtpAndLogin(req, res) {
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

    const vendor = await Vendor.findOne({ email: normalizedEmail });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found. Please register first.',
      });
    }

    if (vendor.deletedAt) {
      return res.status(403).json({
        success: false,
        message: 'Vendor profile has been deleted.',
      });
    }

    const now = new Date();
    const lockStatus = checkAndClearOtpLock(vendor, now);
    if (lockStatus.locked) {
      return res.status(429).json(buildLockPayload(lockStatus.lockedUntil, now));
    }

    if (!vendor.otp) {
      if (lockStatus.unlocked) {
        await vendor.save();
      }
      return res.status(400).json({
        success: false,
        message: 'No active OTP found. Please request a new OTP.',
      });
    }

    if (vendor.otpExpiresAt && new Date(vendor.otpExpiresAt) < now) {
      if (lockStatus.unlocked) {
        await vendor.save();
      }
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    if (vendor.otp !== normalizedOtp) {
      vendor.otpAttempts = (vendor.otpAttempts || 0) + 1;

      if (vendor.otpAttempts >= MAX_OTP_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + OTP_LOCK_DURATION_MS);
        vendor.otpLockedUntil = lockedUntil;
        vendor.otp = null;
        vendor.otpExpiresAt = null;
        await vendor.save();
        return res.status(429).json(buildLockPayload(lockedUntil, now));
      }

      const remainingAttempts = MAX_OTP_ATTEMPTS - vendor.otpAttempts;
      await vendor.save();
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
        attemptsUsed: vendor.otpAttempts,
        remainingAttempts,
      });
    }

    // OTP verified successfully: clear OTP state and attempt counters
    vendor.otp = null;
    vendor.otpExpiresAt = null;
    vendor.otpAttempts = 0;
    vendor.otpLockedUntil = null;
    vendor.isEmailVerified = true;
    await vendor.save();

    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: 'vendor' },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      vendor: buildVendorSummary(vendor),
    });
  } catch (error) {
    console.error('verifyOtpAndLogin error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying OTP.',
      error: error.message,
    });
  }
}

/**
 * @desc    Login vendor with email and OTP
 * @route   POST /api/vendor/auth/login
 */
exports.login = verifyOtpAndLogin;

/**
 * @desc    Verify OTP & Login Vendor (alias for backward compatibility)
 * @route   POST /api/vendor/auth/verify-otp
 */
exports.verifyOtp = verifyOtpAndLogin;
