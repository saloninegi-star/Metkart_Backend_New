// src/utils/mailer.js
const nodemailer = require("nodemailer");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function createSmtpTransporter() {
  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 5000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 5000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 10000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const transporter = createSmtpTransporter();

function parseSender(fromValue, fallbackEmail) {
  const defaultName = (process.env.BREVO_SENDER_NAME || "Metkart").trim();
  if (process.env.BREVO_SENDER_EMAIL) {
    return {
      name: defaultName,
      email: process.env.BREVO_SENDER_EMAIL.trim(),
    };
  }

  const raw = (fromValue || "").trim();
  const match = raw.match(/^(?:"?([^"<]+?)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: (match[1] || defaultName).trim(),
      email: match[2].trim(),
    };
  }

  return {
    name: defaultName,
    email: raw || (fallbackEmail || "").trim(),
  };
}

function buildOtpEmailHtml(otp, fullName) {
  return `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #165B33;">Verify Your Email</h2>
        <p>Hi ${fullName},</p>
        <p>Your 6-digit verification code is:</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #165B33; margin: 16px 0;">
          ${otp}
        </div>
        <p>This OTP is valid for 10 minutes. Please do not share it with anyone.</p>
      </div>
    `;
}

async function sendViaBrevo({ toEmail, fullName, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const sender = parseSender(process.env.SMTP_FROM, process.env.SMTP_USER);
  if (!sender.email) {
    throw new Error("BREVO_SENDER_EMAIL or SMTP_FROM must be configured to send via Brevo");
  }

  const timeoutMs = Number(process.env.BREVO_TIMEOUT_MS) || 10000;
  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: toEmail, name: fullName }],
      subject,
      htmlContent,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Brevo API error (${response.status}): ${errorBody || response.statusText}`);
  }

  return response.json();
}

const sendOtpEmail = async (toEmail, otp, fullName = "User") => {
  const subject = "Your Verification OTP - Metkart";
  const html = buildOtpEmailHtml(otp, fullName);
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject,
    html,
  };

  const hasSmtpConfig = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

  if (hasSmtpConfig) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (smtpErr) {
      if (!process.env.BREVO_API_KEY) {
        throw smtpErr;
      }
      console.warn(
        `[Mailer] Nodemailer SMTP failed (${smtpErr.message}); falling back to Brevo HTTPS API`
      );
      return await sendViaBrevo({
        toEmail,
        fullName,
        subject,
        htmlContent: html,
      });
    }
  }

  if (process.env.BREVO_API_KEY) {
    return await sendViaBrevo({
      toEmail,
      fullName,
      subject,
      htmlContent: html,
    });
  }

  throw new Error("No email transport configured (set SMTP credentials or BREVO_API_KEY)");
};

module.exports = { sendOtpEmail, transporter };
