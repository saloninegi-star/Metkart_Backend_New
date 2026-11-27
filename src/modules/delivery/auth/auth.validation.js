const { z } = require("zod");
const { deliveryEnv } = require("../config/env");

const phoneRegex = /^[6-9][0-9]{9}$/;

const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email("Must be a valid email address"),
    password: z
      .string()
      .min(deliveryEnv.PASSWORD_MIN_LENGTH, `Password must be at least ${deliveryEnv.PASSWORD_MIN_LENGTH} characters`)
      .max(72, "Password must not exceed 72 characters"),
    role: z.literal("RIDER", {
      errorMap: () => ({ message: "role is required and must be RIDER" }),
    }),
    phone: z
      .string()
      .regex(phoneRegex, "Phone must be a valid 10-digit Indian mobile number")
      .optional()
      .nullable(),
  })
  .strict();

const otpFlowSchema = z
  .enum(["REGISTER", "EMAIL_VERIFY", "FORGOT_PASSWORD", "PASSWORD_RESET"])
  .optional()
  .default("REGISTER");

const verifyOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email("Must be a valid email address"),
    otp: z.string().trim().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
    flow: otpFlowSchema,
  })
  .strict();

const resendOtpSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email("Must be a valid email address"),
    flow: otpFlowSchema,
  })
  .strict();

const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email("Must be a valid email address"),
  })
  .strict();

const resetPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email("Must be a valid email address")
      .optional(),
    resetToken: z.string().trim().min(1, "resetToken is required"),
    newPassword: z
      .string()
      .min(
        deliveryEnv.PASSWORD_MIN_LENGTH,
        `Password must be at least ${deliveryEnv.PASSWORD_MIN_LENGTH} characters`
      )
      .max(72, "Password must not exceed 72 characters"),
    confirmPassword: z.string().min(1, "confirmPassword is required"),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "confirmPassword must match newPassword",
    path: ["confirmPassword"],
  });

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, "refreshToken is required"),
  })
  .strict();

const contactSchema = z
  .object({
    phone: z.string().regex(phoneRegex, "Phone must be a valid 10-digit Indian mobile number starting with 6-9"),
  })
  .strict();

module.exports = {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginSchema,
  refreshSchema,
  contactSchema,
};
