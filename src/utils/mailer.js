// src/utils/mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendOtpEmail = async (toEmail, otp, fullName = "User") => {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "Your Verification OTP - Metkart",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #165B33;">Verify Your Email</h2>
        <p>Hi ${fullName},</p>
        <p>Your 6-digit verification code is:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #165B33; margin: 16px 0;">
          ${otp}
        </div>
        <p>This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

module.exports = { sendOtpEmail };
