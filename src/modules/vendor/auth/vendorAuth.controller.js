const jwt = require('jsonwebtoken');
const Vendor = require('./vendorAuth.model');

const JWT_SECRET = process.env.JWT_SECRET || 'your_metkart_jwt_secret_key';
const DUMMY_OTP = '123456'; 

/**
 * @desc    Send OTP for Login / Registration
 * @route   POST /api/vendor/auth/send-otp
 */
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // OTP 10 minute ke liye valid rahega
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Vendor dhundein ya naya create karein (Sign in / Register ek hi flow hai)
    let vendor = await Vendor.findOne({ email: normalizedEmail });

    if (!vendor) {
      vendor = new Vendor({
        email: normalizedEmail,
        otp: DUMMY_OTP,
        otpExpiresAt,
      });
    } else {
      vendor.otp = DUMMY_OTP;
      vendor.otpExpiresAt = otpExpiresAt;
    }

    await vendor.save();

    // Note: Production mein yahan nodemailer / sendgrid call hoga
    console.log(`[MetKart] Dummy OTP for ${normalizedEmail} is: ${DUMMY_OTP}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully to your email.',
      // Testing ke liye response me bhi OTP bhej rahe hain:
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
 * @desc    Verify OTP & Login / Register Vendor
 * @route   POST /api/vendor/auth/verify-otp
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const vendor = await Vendor.findOne({ email: normalizedEmail });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found. Please request a new OTP.',
      });
    }

    // OTP Match check
    if (vendor.otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please enter the correct code.',
      });
    }

    // OTP Expiry check
    if (vendor.otpExpiresAt && vendor.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    // OTP successfully verify hone par reset karein
    vendor.otp = null;
    vendor.otpExpiresAt = null;
    vendor.isEmailVerified = true;
    await vendor.save();

    // JWT Token generate karein
    const token = jwt.sign(
      { id: vendor._id, email: vendor.email, role: 'vendor' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      token,
      vendor: {
        id: vendor._id,
        email: vendor.email,
        isEmailVerified: vendor.isEmailVerified,
        isProfileComplete: vendor.isProfileComplete,
      },
    });
  } catch (error) {
    console.error('verifyOtp error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying OTP.',
      error: error.message,
    });
  }
};