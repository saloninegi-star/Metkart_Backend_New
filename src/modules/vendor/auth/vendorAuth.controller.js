const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Vendor = require('./vendorAuth.model');
const mailer = require('../../../utils/mailer');

const DUMMY_OTP = '123456';
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;
const OTP_LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s()-]{8,20}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const VALID_ROLE_TYPES = ['shopkeeper', 'restaurant', 'mechanic', 'scrapVendor', 'user'];
const LOCATION_FIELDS = new Set([
  'shopNo',
  'buildingNo',
  'floor',
  'town',
  'area',
  'sector',
  'locality',
  'city',
  'state',
  'pincode',
  'nearbyLandmark',
  'landmark',
  'latitude',
  'longitude',
  'formattedAddress',
  'googleMapsLocation',
]);
const REGISTRATION_ALLOWED_FIELDS = new Set([
  'fullName',
  'ownerFullName',
  'mobileNumber',
  'whatsappUpdates',
  'primaryContactSameAsOwner',
  'primaryContactNumber',
  'roleType',
  'onboardingType',
  'businessTypeId',
  'shopTypeId',
  'categoryId',
  'productCategoryId',
  'productCategory',
  'termsAccepted',
  'location',
  ...LOCATION_FIELDS,
  'panDetails',
  'panNumber',
  'panFullName',
  'aadhaarDetails',
  'gstDetails',
  'gstRegistered',
  'gstNumber',
  'gstFullName',
  'registeredBusinessAddress',
  'tradeLicenseNumber',
  'bankDetails',
  'bankAccountNumber',
  'ifscCode',
  'accountType',
  'restaurantDetails',
  'mechanicDetails',
  'shopkeeperDetails',
  'scrapVendorDetails',
  'userDetails',
]);

function getJwtSecret() {
  return process.env.JWT_SECRET || 'your_metkart_jwt_secret_key';
}

function isProductionEnv() {
  return process.env.NODE_ENV === 'production';
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.toLowerCase().trim() : '';
}

function isValidEmail(email) {
  return Boolean(email && email.length <= 254 && EMAIL_REGEX.test(email));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isVendorProfileCompleted(vendor) {
  return Boolean(vendor?.isProfileCompleted || vendor?.isProfileComplete);
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
  const profileCompleted = isVendorProfileCompleted(vendor);
  return {
    id: vendor._id,
    email: vendor.email,
    fullName: vendor.fullName ?? vendor.ownerFullName ?? null,
    ownerFullName: vendor.ownerFullName ?? vendor.fullName ?? null,
    mobileNumber: vendor.mobileNumber ?? null,
    roleType: vendor.roleType ?? vendor.onboardingType ?? null,
    onboardingType: vendor.onboardingType ?? vendor.roleType ?? null,
    onboardingStatus: vendor.onboardingStatus ?? 'not_started',
    isEmailVerified: Boolean(vendor.isEmailVerified),
    isProfileCompleted: profileCompleted,
    isProfileComplete: profileCompleted,
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
  if (!isProductionEnv()) {
    console.log(`[MetKart] Dummy OTP for ${vendor.email} is: ${DUMMY_OTP}`);
  }
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
        isProfileCompleted: false,
        isProfileComplete: false,
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
      ...(!isProductionEnv() ? { dummyOtp: DUMMY_OTP } : {}),
      vendor: buildVendorSummary(vendor),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A vendor with this email already exists.',
      });
    }
    console.error('register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while registering vendor.',
      error: error.message,
    });
  }
};

/**
 * @desc    Send or Resend OTP to email (creates vendor record if it does not exist)
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

    let vendor = await Vendor.findOne({ email: normalizedEmail });

    if (vendor?.deletedAt) {
      return res.status(403).json({
        success: false,
        message: 'Vendor profile has been deleted.',
      });
    }

    const now = new Date();
    if (!vendor) {
      vendor = new Vendor({
        email: normalizedEmail,
        isEmailVerified: false,
        isProfileCompleted: false,
        isProfileComplete: false,
        otpAttempts: 0,
        otpLockedUntil: null,
      });
    } else {
      const lockStatus = checkAndClearOtpLock(vendor, now);
      if (lockStatus.locked) {
        return res.status(429).json(buildLockPayload(lockStatus.lockedUntil, now));
      }
    }

    try {
      await issueAndSendOtp(vendor, now);
    } catch (saveErr) {
      // Handle race-condition duplicate email insert gracefully by reusing the created vendor
      if (saveErr?.code === 11000) {
        const existingVendor = await Vendor.findOne({ email: normalizedEmail });
        if (!existingVendor) throw saveErr;
        if (existingVendor.deletedAt) {
          return res.status(403).json({
            success: false,
            message: 'Vendor profile has been deleted.',
          });
        }
        const existingLock = checkAndClearOtpLock(existingVendor, now);
        if (existingLock.locked) {
          return res.status(429).json(buildLockPayload(existingLock.lockedUntil, now));
        }
        await issueAndSendOtp(existingVendor, now);
      } else {
        throw saveErr;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully to your email.',
      ...(!isProductionEnv() ? { dummyOtp: DUMMY_OTP } : {}),
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
        message: 'Vendor not found. Please request a new OTP.',
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

    // Preserve backward compatibility for existing vendors that only have isProfileComplete
    const isProfileCompleted = isVendorProfileCompleted(vendor);
    vendor.isProfileCompleted = isProfileCompleted;
    vendor.isProfileComplete = isProfileCompleted;
    await vendor.save();

    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: 'vendor' },
      getJwtSecret(),
      { expiresIn: '30d' }
    );

    const isNewUser = !isProfileCompleted;
    return res.status(200).json({
      success: true,
      isNewUser,
      isProfileCompleted,
      message: isNewUser
        ? 'OTP verified. Please complete your registration.'
        : 'Login successful!',
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
 * Validate and extract Vendor schema registration fields from request body.
 */
function parseAndValidateRegistration(body) {
  if (!isPlainObject(body)) {
    return { errors: ['Registration data must be a JSON object'], value: {} };
  }

  const errors = [];
  const unknownFields = Object.keys(body).filter(
    (key) => !REGISTRATION_ALLOWED_FIELDS.has(key) || key === '__proto__'
  );
  if (unknownFields.length) {
    errors.push(`Unsupported registration fields: ${unknownFields.join(', ')}`);
  }

  const resolvedName =
    typeof body.ownerFullName === 'string' && body.ownerFullName.trim()
      ? body.ownerFullName.trim()
      : typeof body.fullName === 'string' && body.fullName.trim()
      ? body.fullName.trim()
      : '';
  if (!resolvedName || resolvedName.length > 120) {
    errors.push('ownerFullName (or fullName) is required and must be at most 120 characters');
  }

  const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : '';
  if (!mobileNumber || !PHONE_REGEX.test(mobileNumber)) {
    errors.push('A valid mobileNumber is required');
  }

  const roleType = body.roleType ?? body.onboardingType;
  if (typeof roleType !== 'string' || !VALID_ROLE_TYPES.includes(roleType)) {
    errors.push(`roleType is required and must be one of: ${VALID_ROLE_TYPES.join(', ')}`);
  }

  if (
    body.primaryContactSameAsOwner !== undefined &&
    typeof body.primaryContactSameAsOwner !== 'boolean'
  ) {
    errors.push('primaryContactSameAsOwner must be a boolean');
  }

  if (body.primaryContactSameAsOwner === false) {
    const primaryContact =
      typeof body.primaryContactNumber === 'string' ? body.primaryContactNumber.trim() : '';
    if (!primaryContact || !PHONE_REGEX.test(primaryContact)) {
      errors.push('primaryContactNumber is required and must be valid when it differs from owner');
    }
  } else if (
    body.primaryContactNumber !== undefined &&
    body.primaryContactNumber !== null &&
    body.primaryContactNumber !== '' &&
    (typeof body.primaryContactNumber !== 'string' || !PHONE_REGEX.test(body.primaryContactNumber.trim()))
  ) {
    errors.push('primaryContactNumber must be a valid phone number');
  }

  for (const boolKey of ['whatsappUpdates', 'termsAccepted', 'gstRegistered']) {
    if (body[boolKey] !== undefined && typeof body[boolKey] !== 'boolean') {
      errors.push(`${boolKey} must be a boolean`);
    }
  }

  for (const idKey of ['businessTypeId', 'shopTypeId', 'categoryId', 'productCategoryId']) {
    if (
      body[idKey] !== undefined &&
      body[idKey] !== null &&
      body[idKey] !== '' &&
      !mongoose.Types.ObjectId.isValid(body[idKey])
    ) {
      errors.push(`${idKey} must be a valid ID`);
    }
  }

  if (body.location !== undefined && !isPlainObject(body.location)) {
    errors.push('location must be an object');
  }

  const location = isPlainObject(body.location) ? { ...body.location } : {};
  for (const key of LOCATION_FIELDS) {
    if (body[key] !== undefined) {
      location[key] = body[key];
    }
  }
  for (const coord of ['latitude', 'longitude']) {
    if (location[coord] !== undefined && location[coord] !== null) {
      const num = typeof location[coord] === 'string' ? Number(location[coord]) : location[coord];
      if (typeof num !== 'number' || !Number.isFinite(num)) {
        errors.push(`location.${coord} must be a valid number`);
      } else {
        location[coord] = num;
      }
    }
  }

  const panNumber = body.panNumber ?? body.panDetails?.panNumber;
  if (panNumber && (typeof panNumber !== 'string' || !PAN_REGEX.test(panNumber.trim()))) {
    errors.push('panNumber must be a valid PAN number');
  }

  const ifscCode = body.ifscCode ?? body.bankDetails?.ifscCode;
  if (ifscCode && (typeof ifscCode !== 'string' || !IFSC_REGEX.test(ifscCode.trim()))) {
    errors.push('ifscCode must be a valid IFSC code');
  }

  for (const nestedKey of [
    'panDetails',
    'aadhaarDetails',
    'gstDetails',
    'bankDetails',
    'restaurantDetails',
    'mechanicDetails',
    'shopkeeperDetails',
    'scrapVendorDetails',
    'userDetails',
  ]) {
    if (body[nestedKey] !== undefined && !isPlainObject(body[nestedKey])) {
      errors.push(`${nestedKey} must be an object`);
    }
  }

  return {
    errors,
    value: {
      resolvedName,
      mobileNumber,
      roleType,
      location,
    },
  };
}

/**
 * @desc    Complete vendor registration after OTP email verification
 * @route   POST /vendor/complete-registration
 * @route   POST /api/vendor/complete-registration
 * @route   POST /api/vendor/auth/complete-registration
 */
exports.completeRegistration = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.vendor?._id;
    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: 'Vendor authentication token required.',
      });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found.',
      });
    }

    if (vendor.deletedAt) {
      return res.status(403).json({
        success: false,
        message: 'Vendor profile has been deleted.',
      });
    }

    if (!vendor.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email must be verified before completing registration.',
      });
    }

    if (isVendorProfileCompleted(vendor)) {
      return res.status(409).json({
        success: false,
        message: 'Vendor registration is already completed.',
      });
    }

    const body = req.body || {};
    const { errors, value } = parseAndValidateRegistration(body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: 'Registration details are invalid.',
        errors,
      });
    }

    vendor.ownerFullName = value.resolvedName;
    vendor.fullName = value.resolvedName;
    vendor.mobileNumber = value.mobileNumber;
    vendor.roleType = value.roleType;
    vendor.onboardingType = value.roleType;

    if (body.whatsappUpdates !== undefined) vendor.whatsappUpdates = body.whatsappUpdates;
    if (body.primaryContactSameAsOwner !== undefined) {
      vendor.primaryContactSameAsOwner = body.primaryContactSameAsOwner;
    }
    if (body.primaryContactNumber !== undefined) {
      vendor.primaryContactNumber =
        typeof body.primaryContactNumber === 'string'
          ? body.primaryContactNumber.trim()
          : body.primaryContactNumber;
    }
    if (body.termsAccepted !== undefined) vendor.termsAccepted = body.termsAccepted;
    if (body.businessTypeId) vendor.businessTypeId = body.businessTypeId;
    if (body.shopTypeId) vendor.shopTypeId = body.shopTypeId;
    if (body.categoryId) vendor.categoryId = body.categoryId;
    if (body.productCategoryId) vendor.productCategoryId = body.productCategoryId;
    if (typeof body.productCategory === 'string') vendor.productCategory = body.productCategory.trim();

    if (Object.keys(value.location).length) {
      const prevLocation =
        typeof vendor.location?.toObject === 'function'
          ? vendor.location.toObject()
          : { ...(vendor.location || {}) };
      vendor.location = { ...prevLocation, ...value.location };
    }

    for (const nestedKey of [
      'panDetails',
      'aadhaarDetails',
      'gstDetails',
      'bankDetails',
      'restaurantDetails',
      'mechanicDetails',
      'shopkeeperDetails',
      'scrapVendorDetails',
      'userDetails',
    ]) {
      if (isPlainObject(body[nestedKey])) {
        const prevNested =
          typeof vendor[nestedKey]?.toObject === 'function'
            ? vendor[nestedKey].toObject()
            : { ...(vendor[nestedKey] || {}) };
        vendor[nestedKey] = { ...prevNested, ...body[nestedKey] };
      }
    }

    // Sync optional flat tax/bank fields from Vendor schema if provided
    if (body.panNumber) vendor.panNumber = String(body.panNumber).trim().toUpperCase();
    if (body.panFullName) vendor.panFullName = String(body.panFullName).trim();
    if (body.gstRegistered !== undefined) vendor.gstRegistered = body.gstRegistered;
    if (body.gstNumber) vendor.gstNumber = String(body.gstNumber).trim().toUpperCase();
    if (body.gstFullName) vendor.gstFullName = String(body.gstFullName).trim();
    if (body.registeredBusinessAddress) {
      vendor.registeredBusinessAddress = String(body.registeredBusinessAddress).trim();
    }
    if (body.tradeLicenseNumber) vendor.tradeLicenseNumber = String(body.tradeLicenseNumber).trim();
    if (body.bankAccountNumber) vendor.bankAccountNumber = String(body.bankAccountNumber).trim();
    if (body.ifscCode) vendor.ifscCode = String(body.ifscCode).trim().toUpperCase();
    if (body.accountType) vendor.accountType = String(body.accountType).trim();

    vendor.onboardingData = {
      ...(vendor.onboardingData || {}),
      ownerFullName: vendor.ownerFullName,
      mobileNumber: vendor.mobileNumber,
      ...(Object.keys(value.location).length ? { location: vendor.location } : {}),
      ...(body.restaurantDetails?.restaurantName
        ? { restaurantName: body.restaurantDetails.restaurantName }
        : {}),
      ...(body.shopkeeperDetails?.shopkeeperName
        ? { shopkeeperName: body.shopkeeperDetails.shopkeeperName }
        : {}),
      ...(body.mechanicDetails?.garageName || body.mechanicDetails?.mechanicName
        ? { garageName: body.mechanicDetails.garageName || body.mechanicDetails.mechanicName }
        : {}),
      ...(body.scrapVendorDetails?.businessName
        ? { businessName: body.scrapVendorDetails.businessName }
        : {}),
    };

    vendor.isProfileCompleted = true;
    vendor.isProfileComplete = true;

    if (typeof vendor.validate === 'function') {
      await vendor.validate();
    }
    await vendor.save();

    return res.status(200).json({
      success: true,
      message: 'Registration completed successfully.',
      vendor: buildVendorSummary(vendor),
    });
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Registration validation failed.',
        error: error.message,
      });
    }
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate vendor field error.',
      });
    }
    console.error('completeRegistration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while completing registration.',
      error: error.message,
    });
  }
};

exports.login = verifyOtpAndLogin;
exports.verifyOtp = verifyOtpAndLogin;
exports.verifyOtpAndLogin = verifyOtpAndLogin;
exports.buildVendorSummary = buildVendorSummary;
