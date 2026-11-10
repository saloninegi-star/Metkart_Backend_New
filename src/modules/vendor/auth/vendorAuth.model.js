const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // OTP verification fields
    otp: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    // Profile status
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    onboardingType: {
      type: String,
      enum: ["shopkeeper", "restaurant", "mechanic", "scrapVendor"],
      default: null,
    },
    onboardingData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    onboardingFiles: {
      type: [
        {
          fieldName: {
            type: String,
            required: true,
          },
          originalName: {
            type: String,
            required: true,
          },
          mimeType: {
            type: String,
            required: true,
          },
          size: {
            type: Number,
            required: true,
          },
          path: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
    onboardingStatus: {
      type: String,
      enum: ["not_started", "draft", "submitted", "under_review", "approved", "rejected", "blocked"],
      default: "not_started",
    },
    onboardingReason: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'blocked'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vendor', vendorSchema);