const express = require('express');
const router = express.Router();
const { sendOtp, verifyOtp } = require('./vendorAuth.controller');

// Send OTP (Sign in / Register)
router.post('/send-otp', sendOtp);

// Resend OTP (Same handler use ho sakta hai)
router.post('/resend-otp', sendOtp);

// Verify 6-digit OTP
router.post('/verify-otp', verifyOtp);

module.exports = router;