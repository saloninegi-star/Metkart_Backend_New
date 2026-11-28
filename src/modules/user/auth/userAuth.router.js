const express = require('express');
const {
  registerUser,
  loginUser,
  verifyOtp,
  sendOtp,
  resendOtp,
} = require('./userAuth.controller');

const router = express.Router();

// Register user with fullName, email, mobileNumber, currentAddress, password (sends OTP to email)
router.post('/register', registerUser);

// Login user with email and password
router.post('/login', loginUser);

// Send / Resend OTP to registered user email
router.post('/send-otp', sendOtp);
router.post('/resend-otp', resendOtp);

// Verify 6-digit OTP (3 wrong attempts -> 24-hour lockout)
router.post('/verify-otp', verifyOtp);

module.exports = router;
