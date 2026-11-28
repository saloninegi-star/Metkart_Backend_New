const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mailer = require('./mailer');

const DUMMY_OTP = '123456';
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;
const OTP_LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s()-]{8,20}$/;

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

function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_REGEX.test(phone.trim());
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
 * Check if the account is currently locked out from OTP verification/sending.
 * Automatically clears expired locks after 24 hours.
 */
function checkAndClearOtpLock(record, now = new Date()) {
  if (!record?.otpLockedUntil) {
    return { locked: false, unlocked: false };
  }

  const lockedUntilDate = new Date(record.otpLockedUntil);
  if (lockedUntilDate > now) {
    return { locked: true, lockedUntil: lockedUntilDate, unlocked: false };
  }

  record.otpLockedUntil = null;
  record.otpAttempts = 0;
  return { locked: false, unlocked: true };
}

function signRoleToken(record, role) {
  return jwt.sign(
    { id: record._id, email: record.email, role },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
}

function getAccountRestrictionError(record, entityLabel = 'Vendor') {
  if (record?.deletedAt) {
    return { status: 403, message: `${entityLabel} profile has been deleted.` };
  }
  if (record?.status === 'blocked') {
    return { status: 403, message: `${entityLabel} account is blocked.` };
  }
  return null;
}

async function findOneByEmailWithPassword(Model, normalizedEmail) {
  const query = Model.findOne({ email: normalizedEmail });
  return typeof query?.select === 'function'
    ? await query.select('+passwordHash')
    : await query;
}

/**
 * Persist dummy OTP with 10-minute expiry and trigger email delivery non-blockingly.
 */
async function issueAndSendOtp(record, { recipientName = 'User', now = new Date() } = {}) {
  record.otp = DUMMY_OTP;
  record.otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
  await record.save();

  try {
    await mailer.sendOtpEmail(record.email, DUMMY_OTP, recipientName);
  } catch (mailError) {
    console.warn(`[MetKart] Email OTP delivery failed for ${record.email}: ${mailError.message}`);
  }
  if (!isProductionEnv()) {
    console.log(`[MetKart] Dummy OTP for ${record.email} is: ${DUMMY_OTP}`);
  }
}

/**
 * Validate submitted OTP against stored record, enforcing 3-attempt -> 24h lock policy.
 */
async function validateAndConsumeOtp(record, normalizedOtp, now = new Date()) {
  const lockStatus = checkAndClearOtpLock(record, now);
  if (lockStatus.locked) {
    return { ok: false, status: 429, body: buildLockPayload(lockStatus.lockedUntil, now) };
  }

  if (!record.otp) {
    if (lockStatus.unlocked) {
      await record.save();
    }
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'No active OTP found. Please request a new OTP.',
      },
    };
  }

  if (record.otpExpiresAt && new Date(record.otpExpiresAt) < now) {
    if (lockStatus.unlocked) {
      await record.save();
    }
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: 'OTP has expired. Please request a new one.',
      },
    };
  }

  if (record.otp !== normalizedOtp) {
    record.otpAttempts = (record.otpAttempts || 0) + 1;

    if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + OTP_LOCK_DURATION_MS);
      record.otpLockedUntil = lockedUntil;
      record.otp = null;
      record.otpExpiresAt = null;
      await record.save();
      return { ok: false, status: 429, body: buildLockPayload(lockedUntil, now) };
    }

    const remainingAttempts = MAX_OTP_ATTEMPTS - record.otpAttempts;
    await record.save();
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        message: `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
        attemptsUsed: record.otpAttempts,
        remainingAttempts,
      },
    };
  }

  record.otp = null;
  record.otpExpiresAt = null;
  record.otpAttempts = 0;
  record.otpLockedUntil = null;
  return { ok: true };
}

/**
 * Validate email + password credentials for a verified account.
 */
async function authenticateWithPassword({
  Model,
  email,
  password,
  entityLabel = 'Account',
  isVerifiedFn = (record) => Boolean(record.isEmailVerified),
  noPasswordMessage = 'Password is not set for this account. Please register with a password.',
}) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || typeof password !== 'string' || password.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Email and password are required.' },
    };
  }

  if (!isValidEmail(normalizedEmail)) {
    return {
      ok: false,
      status: 400,
      body: { success: false, message: 'Please provide a valid email address.' },
    };
  }

  const record = await findOneByEmailWithPassword(Model, normalizedEmail);
  if (!record) {
    return {
      ok: false,
      status: 401,
      body: { success: false, message: 'Invalid email or password.' },
    };
  }

  const restriction = getAccountRestrictionError(record, entityLabel);
  if (restriction) {
    return {
      ok: false,
      status: restriction.status,
      body: { success: false, message: restriction.message },
    };
  }

  if (!isVerifiedFn(record)) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        message: 'Email is not verified. Please verify your email with OTP first.',
      },
    };
  }

  if (!record.passwordHash) {
    return {
      ok: false,
      status: 401,
      body: { success: false, message: noPasswordMessage },
    };
  }

  const isPasswordValid = await bcrypt.compare(password, record.passwordHash);
  if (!isPasswordValid) {
    return {
      ok: false,
      status: 401,
      body: { success: false, message: 'Invalid email or password.' },
    };
  }

  return { ok: true, record };
}

module.exports = {
  DUMMY_OTP,
  OTP_EXPIRY_MS,
  MAX_OTP_ATTEMPTS,
  OTP_LOCK_DURATION_MS,
  EMAIL_REGEX,
  PHONE_REGEX,
  getJwtSecret,
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
};
