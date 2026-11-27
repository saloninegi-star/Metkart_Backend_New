const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const fileSchema = new mongoose.Schema(
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
    url: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    shopNo: { type: String, trim: true, default: '' },
    buildingNo: { type: String, trim: true, default: '' },
    floor: { type: String, trim: true, default: '' },
    town: { type: String, trim: true, default: '' },
    area: { type: String, trim: true, default: '' },
    sector: { type: String, trim: true, default: '' },
    locality: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    nearbyLandmark: { type: String, trim: true, default: '' },
    landmark: { type: String, trim: true, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    formattedAddress: { type: String, trim: true, default: '' },
    googleMapsLocation: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const panDetailsSchema = new mongoose.Schema(
  {
    panNumber: { type: String, trim: true, uppercase: true, default: null },
    fullName: { type: String, trim: true, default: null },
    businessAddress: { type: String, trim: true, default: null },
    cardUrl: { type: String, default: null },
    cardPath: { type: String, default: null },
  },
  { _id: false }
);

const aadhaarDetailsSchema = new mongoose.Schema(
  {
    aadhaarNumber: { type: String, trim: true, default: null },
    fullName: { type: String, trim: true, default: null },
    businessAddress: { type: String, trim: true, default: null },
    cardUrl: { type: String, default: null },
    cardPath: { type: String, default: null },
  },
  { _id: false }
);

const gstDetailsSchema = new mongoose.Schema(
  {
    isRegistered: { type: Boolean, default: false },
    gstNumber: { type: String, trim: true, uppercase: true, default: null },
    fullName: { type: String, trim: true, default: null },
    businessAddress: { type: String, trim: true, default: null },
    certificateUrl: { type: String, default: null },
    certificatePath: { type: String, default: null },
  },
  { _id: false }
);

const bankDetailsSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, trim: true, default: null },
    ifscCode: { type: String, trim: true, uppercase: true, default: null },
    accountType: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const restaurantDetailsSchema = new mongoose.Schema(
  {
    restaurantName: { type: String, trim: true, default: null },
    fssaiNumber: { type: String, trim: true, default: null },
    fssaiLicenseNumber: { type: String, trim: true, default: null },
    cuisineTypes: { type: [String], default: [] },
    costForTwo: { type: Number, default: null },
    diningAvailable: { type: Boolean, default: false },
    photos: {
      menuCard: { type: [String], default: [] },
      outletPhotos: { type: [String], default: [] },
      storefrontPhotos: { type: [String], default: [] },
      fssaiCertificate: { type: String, default: null },
    },
  },
  { _id: false }
);

const mechanicDetailsSchema = new mongoose.Schema(
  {
    productCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', default: null },
    productCategory: { type: String, trim: true, default: null },
    mechanicName: { type: String, trim: true, default: null },
    garageName: { type: String, trim: true, default: null },
    servicesOffered: { type: [String], default: [] },
    supportedVehicles: { type: [String], default: [] },
    serviceCategories: { type: [String], default: [] },
    yearsExperience: { type: Number, default: null },
    timing: {
      openTime: { type: String, trim: true, default: null },
      closeTime: { type: String, trim: true, default: null },
      openDays: { type: [String], default: [] },
    },
    deviceType: { type: String, trim: true, default: 'MetKart Mechanic Partner App' },
    licenseDetails: {
      isRegistered: { type: Boolean, default: false },
      licenseNumber: { type: String, trim: true, default: null },
      licenseUrl: { type: String, default: null },
      licensePath: { type: String, default: null },
    },
    photos: {
      workshopFront: { type: String, default: null },
      menuCard: { type: String, default: null },
      menuSpreadsheet: { type: String, default: null },
      tradeLicense: { type: String, default: null },
    },
  },
  { _id: false }
);

const shopkeeperDetailsSchema = new mongoose.Schema(
  {
    productCategoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productCategory: { type: String, trim: true, default: null },
    shopkeeperName: { type: String, trim: true, default: null },
    shopName: { type: String, trim: true, default: null },
    photos: {
      storefrontPhotos: { type: [String], default: [] },
      panCard: { type: String, default: null },
      gstCertificate: { type: String, default: null },
    },
  },
  { _id: false }
);

const scrapVendorDetailsSchema = new mongoose.Schema(
  {
    businessName: { type: String, trim: true, default: null },
    scrapVendorName: { type: String, trim: true, default: null },
    scrapCategories: { type: [String], default: [] },
    pickupAvailable: { type: Boolean, default: false },
  },
  { _id: false }
);

const vendorSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      default: null,
      select: false,
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
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpLockedUntil: {
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
    // Role / Onboarding identification
    roleType: {
      type: String,
      enum: ["shopkeeper", "restaurant", "mechanic", "scrapVendor", "user"],
      default: null,
    },
    onboardingType: {
      type: String,
      enum: ["shopkeeper", "restaurant", "mechanic", "scrapVendor", "user"],
      default: null,
    },

    // Common fields stored at the root level of Vendor
    ownerFullName: { type: String, trim: true, default: null },
    fullName: { type: String, trim: true, default: null },
    mobileNumber: { type: String, trim: true, default: null },
    whatsappUpdates: { type: Boolean, default: false },
    primaryContactSameAsOwner: { type: Boolean, default: true },
    primaryContactNumber: { type: String, trim: true, default: null },
    businessTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessType', default: null },
    shopTypeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    categoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productCategory: { type: String, trim: true, default: null },
    productCategoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    termsAccepted: { type: Boolean, default: false },

    // Structured Common Sub-Objects
    location: { type: locationSchema, default: () => ({}) },
    panDetails: { type: panDetailsSchema, default: () => ({}) },
    aadhaarDetails: { type: aadhaarDetailsSchema, default: () => ({}) },
    gstDetails: { type: gstDetailsSchema, default: () => ({}) },
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },

    // Role-specific nested objects
    restaurantDetails: { type: restaurantDetailsSchema, default: () => ({}) },
    mechanicDetails: { type: mechanicDetailsSchema, default: () => ({}) },
    shopkeeperDetails: { type: shopkeeperDetailsSchema, default: () => ({}) },
    userDetails: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    scrapVendorDetails: { type: scrapVendorDetailsSchema, default: () => ({}) },

    // Flat common fields maintained for backward compatibility
    panNumber: { type: String, trim: true, uppercase: true, default: null },
    panFullName: { type: String, trim: true, default: null },
    gstRegistered: { type: Boolean, default: false },
    gstNumber: { type: String, trim: true, uppercase: true, default: null },
    gstFullName: { type: String, trim: true, default: null },
    registeredBusinessAddress: { type: String, trim: true, default: null },
    tradeLicenseNumber: { type: String, trim: true, default: null },
    bankAccountNumber: { type: String, trim: true, default: null },
    ifscCode: { type: String, trim: true, uppercase: true, default: null },
    accountType: { type: String, trim: true, default: null },

    // Existing metadata fields
    onboardingData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    onboardingFiles: {
      type: [fileSchema],
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
    deletedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'blocked'],
      default: 'active',
    },
  },
  { timestamps: true }
);

vendorSchema.methods.comparePassword = function comparePassword(password) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('Vendor', vendorSchema);
