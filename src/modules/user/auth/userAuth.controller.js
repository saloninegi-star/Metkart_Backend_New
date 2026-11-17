const jwt = require("jsonwebtoken");
const User = require("./user.model");
const { sendOtpEmail } = require("../../../utils/mailer");

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: "user" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// 1. REGISTER USER (Send OTP)
const registerUser = async (req, res) => {
  try {
    const { fullName, email, mobileNumber, currentAddress } = req.body;

    if (!fullName || !email || !mobileNumber || !currentAddress) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, mobileNumber and currentAddress are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser && existingUser.isVerified) {
      return res.status(409).json({
        success: false,
        message: "Email already registered. Please login.",
      });
    }

    const otp = generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let user;
    if (existingUser && !existingUser.isVerified) {
      existingUser.fullName = fullName.trim();
      existingUser.mobileNumber = mobileNumber.trim();
      existingUser.currentAddress = currentAddress.trim();
      existingUser.otp = otp;
      existingUser.otpExpiresAt = otpExpiresAt;
      user = await existingUser.save();
    } else {
      user = await User.create({
        fullName: fullName.trim(),
        email: normalizedEmail,
        mobileNumber: mobileNumber.trim(),
        currentAddress: currentAddress.trim(),
        otp,
        otpExpiresAt,
        isVerified: false,
      });
    }

    await sendOtpEmail(user.email, otp, user.fullName);

    return res.status(200).json({
      success: true,
      message: `Verification OTP sent to ${user.email}`,
      data: { email: user.email },
    });
  } catch (error) {
    console.error("User Register Error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// 2. LOGIN USER (Send OTP)
const loginUser = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not verified. Please complete registration OTP verification.",
      });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, otp, user.fullName);

    return res.status(200).json({
      success: true,
      message: `Login OTP sent to ${user.email}`,
      data: { email: user.email },
    });
  } catch (error) {
    console.error("User Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// 3. VERIFY OTP (Register + Login dono ke liye)
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.otp || user.otp !== String(otp).trim()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please resend OTP.",
      });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        currentAddress: user.currentAddress,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
      error: error.message,
    });
  }
};

// 4. RESEND OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, otp, user.fullName);

    return res.status(200).json({
      success: true,
      message: `OTP resent successfully to ${user.email}`,
    });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend OTP",
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyOtp,
  resendOtp,
};