const express = require('express');
const router = express.Router();
const authenticateVendor = require('../../../middleware/vendorAuth.middleware');
const {
  register,
  login,
  sendOtp,
  verifyOtp,
  completeRegistration,
} = require('./vendorAuth.controller');

// Register vendor with email and password (sends OTP to email)
router.post('/register', register);

// Login vendor with email and OTP
router.post('/login', login);

// Send / Resend OTP to vendor email (auto-creates record for new emails)
router.post('/send-otp', sendOtp);
router.post('/resend-otp', sendOtp);

// Verify 6-digit OTP and check profile completion status
router.post('/verify-otp', verifyOtp);

// Complete registration for verified vendor
router.post('/complete-registration', authenticateVendor(), completeRegistration);

module.exports = router;
