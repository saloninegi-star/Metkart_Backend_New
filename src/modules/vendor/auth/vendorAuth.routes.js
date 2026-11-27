const express = require('express');
const router = express.Router();
const { register, login, sendOtp, verifyOtp } = require('./vendorAuth.controller');

// Register vendor with email and password (sends OTP to email)
router.post('/register', register);

// Login vendor with email and OTP
router.post('/login', login);

// Send / Resend OTP to registered vendor email
router.post('/send-otp', sendOtp);
router.post('/resend-otp', sendOtp);

// Verify 6-digit OTP (alias for login / registration OTP verification)
router.post('/verify-otp', verifyOtp);

module.exports = router;
