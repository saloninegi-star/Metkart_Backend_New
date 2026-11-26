const mongoose = require("mongoose");

// 1. RiderUser Schema (users collection)
const riderUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      required: true,
      enum: ["RIDER"],
      default: "RIDER",
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
    collection: "users",
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);
riderUserSchema.index({ email: 1 }, { unique: true });
riderUserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);

// 2. OtpSession Schema (otp_sessions collection)
const otpSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    purpose: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "otp_sessions" }
);
otpSessionSchema.index({ userId: 1, purpose: 1 });
otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

// 3. RefreshToken Schema (refresh_tokens collection)
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
  },
  { timestamps: true, collection: "refresh_tokens" }
);
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 4. RiderProfile Schema (rider_profiles collection)
const riderProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    referenceNumber: { type: String, default: null },
    rideType: { type: String, enum: ["TWO_WHEELER", "HEAVY_VEHICLE", null], default: null },
    deliveryPreference: {
      type: String,
      enum: [
        "FOOD_DELIVERY",
        "GROCERY_DELIVERY",
        "BOTH_DELIVERIES",
        "HEAVY_DELIVERY",
        "SCRAP_PICKER",
        null,
      ],
      default: null,
    },
    zoneId: { type: String, default: null },
    vehicleType: {
      type: String,
      enum: [
        "MOTORCYCLE",
        "EV",
        "CYCLE",
        "CARGO_3W",
        "ELECTRIC_CARGO",
        "COMMERCIAL_4W",
        "HEAVY_FREIGHT",
        null,
      ],
      default: null,
    },
    vehicleOwnership: {
      type: String,
      enum: ["SELF_OWNED", "RENTED_LEASED", "FLEET_COMPANY", null],
      default: null,
    },
    fullName: { type: String, default: null },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED"],
      default: "IN_PROGRESS",
    },
    completedSteps: { type: [String], default: [] },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewReason: { type: String, default: null },
    stepsToRedo: { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: "rider_profiles",
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);
riderProfileSchema.index({ userId: 1 }, { unique: true });
riderProfileSchema.index(
  { referenceNumber: 1 },
  { unique: true, partialFilterExpression: { referenceNumber: { $type: "string" } } }
);
riderProfileSchema.index({ status: 1, submittedAt: 1 });

// 5. Zone Schema (zones collection)
const zoneSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Slug ID e.g. 'zone-medipally'
    name: { type: String, required: true },
    city: { type: String, required: true },
    radiusKm: { type: Number, required: true },
    centerLat: { type: Number, required: true },
    centerLng: { type: Number, required: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    demandLevel: {
      type: String,
      enum: ["HIGH", "VERY_HIGH", "SURGE"],
      default: "HIGH",
    },
    activeOrders: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "zones",
    _id: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = doc._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);
zoneSchema.index({ location: "2dsphere" });
zoneSchema.index({ isActive: 1, name: 1 });

// 6. Vehicle Schema (vehicles collection)
const vehicleSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    ownerName: { type: String, default: null },
    vehicleNumber: { type: String, default: null },
    brandModel: { type: String, default: null },
    fuelType: {
      type: String,
      enum: ["PETROL", "DIESEL", "CNG", "ELECTRIC_HEAVY", null],
      default: null,
    },
    loadCapacity: { type: String, default: null },
    permitType: {
      type: String,
      enum: ["INTRA_STATE", "NATIONAL_PERMIT", null],
      default: null,
    },
    evCategory: {
      type: String,
      enum: ["HIGH_SPEED", "LOW_SPEED", null],
      default: null,
    },
    cycleType: {
      type: String,
      enum: ["STANDARD", "ELECTRIC", null],
      default: null,
    },
    dlNumber: { type: String, default: null },
    dlBadge: { type: String, default: null },
    dlExpiryDate: { type: Date, default: null },
  },
  { timestamps: true, collection: "vehicles" }
);
vehicleSchema.index({ riderId: 1 }, { unique: true });
vehicleSchema.index(
  { vehicleNumber: 1 },
  { unique: true, partialFilterExpression: { vehicleNumber: { $type: "string" } } }
);

// 7. FileRecord Schema (files collection)
const fileRecordSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    purpose: {
      type: String,
      required: true,
      enum: [
        "DL",
        "RC",
        "INSURANCE",
        "FITNESS_CERT",
        "PERMIT",
        "PUC",
        "EV_PURCHASE_BILL",
        "ID_PROOF",
        "CYCLE_PHOTO",
        "AADHAAR_DOC",
        "PAN_DOC",
        "SELFIE",
        "PASSBOOK",
      ],
    },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "files",
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.fileId = ret._id.toString();
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);
fileRecordSchema.index({ storageKey: 1 }, { unique: true });
fileRecordSchema.index({ ownerUserId: 1, purpose: 1 });

// 8. RiderDocument Schema (rider_documents collection)
const riderDocumentSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    docType: { type: String, required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileRecord", required: true },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },
  },
  { timestamps: true, collection: "rider_documents" }
);
riderDocumentSchema.index({ riderId: 1, docType: 1 }, { unique: true });

// 9. KycRecord Schema (kyc_records collection)
const kycRecordSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    idType: { type: String, enum: ["AADHAAR", "PAN_ADDRESS"], required: true },
    status: {
      type: String,
      enum: ["VERIFIED", "SUBMITTED", "REJECTED"],
      default: "SUBMITTED",
    },
    aadhaarLast4: { type: String, default: null },
    aadhaarHmac: { type: String, default: null },
    providerRef: { type: String, default: null },
    otpAttempts: { type: Number, default: 0 },
    verifiedName: { type: String, default: null },
    panNumberEnc: { type: String, default: null },
    panName: { type: String, default: null },
    addressText: { type: String, default: null },
    documentFileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileRecord", default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "kyc_records" }
);
kycRecordSchema.index({ riderId: 1 }, { unique: true });
kycRecordSchema.index(
  { aadhaarHmac: 1 },
  { unique: true, partialFilterExpression: { aadhaarHmac: { $type: "string" } } }
);

// 10. SelfieCheck Schema (selfie_checks collection)
const selfieCheckSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileRecord", required: true },
    status: { type: String, enum: ["PASSED", "FAILED"], required: true },
    livenessPassed: { type: Boolean, default: false },
    matchScore: { type: Number, default: 0 },
    reasonCode: { type: String, default: null },
    needsManualReview: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "selfie_checks" }
);
selfieCheckSchema.index({ riderId: 1, createdAt: -1 });

// 11. KitAddress Schema (kit_addresses collection)
const kitAddressSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    houseNo: { type: String, required: true },
    areaStreet: { type: String, required: true },
    pincode: { type: String, required: true },
    townCity: { type: String, required: true },
    state: { type: String, required: true },
  },
  { timestamps: true, collection: "kit_addresses" }
);
kitAddressSchema.index({ riderId: 1 }, { unique: true });

// 12. InsuranceNominee Schema (insurance_nominees collection)
const insuranceNomineeSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    nomineeName: { type: String, required: true },
    relationship: {
      type: String,
      enum: ["SPOUSE", "FATHER", "MOTHER", "SON", "DAUGHTER", "BROTHER", "SISTER", "OTHER"],
      required: true,
    },
    dob: { type: String, required: true },
    mobile: { type: String, required: true },
    emergencyMobile: { type: String, required: true },
  },
  { timestamps: true, collection: "insurance_nominees" }
);
insuranceNomineeSchema.index({ riderId: 1 }, { unique: true });

// 13. BankAccount Schema (bank_accounts collection)
const bankAccountSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    accountNumberEnc: { type: String, required: true },
    accountLast4: { type: String, required: true },
    ifsc: { type: String, required: true },
    bankName: { type: String, required: true },
    branch: { type: String, required: true },
    accountType: { type: String, enum: ["SAVINGS", "CURRENT"], required: true },
    passbookFileId: { type: mongoose.Schema.Types.ObjectId, ref: "FileRecord", required: true },
    holderName: { type: String, default: null },
    nameMatch: {
      type: String,
      enum: ["MATCHED", "MISMATCH", "UNKNOWN"],
      default: "UNKNOWN",
    },
    verificationStatus: { type: String, default: "VERIFIED" },
    upiId: { type: String, default: null },
    upiRegisteredName: { type: String, default: null },
    upiVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "bank_accounts" }
);
bankAccountSchema.index({ riderId: 1 }, { unique: true });

// 14. UpiVerification Schema (upi_verifications collection)
const upiVerificationSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    upiId: { type: String, required: true },
    valid: { type: Boolean, required: true },
    registeredName: { type: String, default: null },
  },
  { timestamps: true, collection: "upi_verifications" }
);
upiVerificationSchema.index({ riderId: 1, createdAt: 1 });
upiVerificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// 15. KitOrder Schema (kit_orders collection)
const kitOrderSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    status: {
      type: String,
      enum: ["PENDING_SHIPMENT", "SHIPPED", "DELIVERED"],
      default: "PENDING_SHIPMENT",
    },
  },
  { timestamps: true, collection: "kit_orders" }
);
kitOrderSchema.index({ riderId: 1 }, { unique: true });

// 16. InsuranceEnrollment Schema (insurance_enrollments collection)
const insuranceEnrollmentSchema = new mongoose.Schema(
  {
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    medicalCoverInr: { type: Number, required: true },
    accidentalCoverInr: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE"],
      default: "PENDING",
    },
  },
  { timestamps: true, collection: "insurance_enrollments" }
);
insuranceEnrollmentSchema.index({ riderId: 1 }, { unique: true });

// 17. IdempotencyKey Schema (idempotency_keys collection)
const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    requestHash: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, collection: "idempotency_keys" }
);
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// 18. Counter Schema (counters collection)
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { collection: "counters", _id: false }
);

// 19. AuditLog Schema (audit_log collection)
const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "audit_log" }
);
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: 1 });
auditLogSchema.index({ actorUserId: 1, createdAt: 1 });

// 20. PasswordResetToken Schema (password_reset_tokens collection)
const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "RiderUser", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "password_reset_tokens" }
);
passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetTokenSchema.index({ userId: 1, usedAt: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// 21. LoginAttempt Schema (login_attempts collection)
const loginAttemptSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, trim: true, lowercase: true },
    failedTimestamps: { type: [Date], default: [] },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "login_attempts" }
);
loginAttemptSchema.index({ identifier: 1 }, { unique: true });
loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helper to register models safely avoiding overwrite errors
const getOrCreateModel = (name, schema, collection) => {
  return mongoose.models[name] || mongoose.model(name, schema, collection);
};

module.exports = {
  RiderUser: getOrCreateModel("RiderUser", riderUserSchema, "users"),
  OtpSession: getOrCreateModel("OtpSession", otpSessionSchema, "otp_sessions"),
  RefreshToken: getOrCreateModel("RefreshToken", refreshTokenSchema, "refresh_tokens"),
  RiderProfile: getOrCreateModel("RiderProfile", riderProfileSchema, "rider_profiles"),
  Zone: getOrCreateModel("Zone", zoneSchema, "zones"),
  Vehicle: getOrCreateModel("Vehicle", vehicleSchema, "vehicles"),
  FileRecord: getOrCreateModel("FileRecord", fileRecordSchema, "files"),
  RiderDocument: getOrCreateModel("RiderDocument", riderDocumentSchema, "rider_documents"),
  KycRecord: getOrCreateModel("KycRecord", kycRecordSchema, "kyc_records"),
  SelfieCheck: getOrCreateModel("SelfieCheck", selfieCheckSchema, "selfie_checks"),
  KitAddress: getOrCreateModel("KitAddress", kitAddressSchema, "kit_addresses"),
  InsuranceNominee: getOrCreateModel("InsuranceNominee", insuranceNomineeSchema, "insurance_nominees"),
  BankAccount: getOrCreateModel("BankAccount", bankAccountSchema, "bank_accounts"),
  UpiVerification: getOrCreateModel("UpiVerification", upiVerificationSchema, "upi_verifications"),
  KitOrder: getOrCreateModel("KitOrder", kitOrderSchema, "kit_orders"),
  InsuranceEnrollment: getOrCreateModel("InsuranceEnrollment", insuranceEnrollmentSchema, "insurance_enrollments"),
  IdempotencyKey: getOrCreateModel("IdempotencyKey", idempotencyKeySchema, "idempotency_keys"),
  Counter: getOrCreateModel("Counter", counterSchema, "counters"),
  AuditLog: getOrCreateModel("AuditLog", auditLogSchema, "audit_log"),
  PasswordResetToken: getOrCreateModel("PasswordResetToken", passwordResetTokenSchema, "password_reset_tokens"),
  LoginAttempt: getOrCreateModel("LoginAttempt", loginAttemptSchema, "login_attempts"),
};
