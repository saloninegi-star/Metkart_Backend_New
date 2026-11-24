const mongoose = require("mongoose");
const {
  RiderUser,
  RiderProfile,
  Zone,
  Vehicle,
  FileRecord,
  RiderDocument,
  KycRecord,
  SelfieCheck,
  KitAddress,
  InsuranceNominee,
  BankAccount,
  UpiVerification,
  KitOrder,
  InsuranceEnrollment,
  Counter,
} = require("../models");
const AppError = require("../lib/AppError");
const { recordAudit } = require("../lib/audit");
const {
  encryptAesGcm,
  hmacSha256,
} = require("../lib/crypto");
const { validateVerhoeff } = require("../lib/verhoeff");
const { calculateTokenOverlap } = require("../lib/tokenOverlap");
const {
  kycProvider,
  faceMatchProvider,
  bankProvider,
  storageProvider,
} = require("../adapters");
const { deliveryEnv } = require("../config/env");

const ALL_STEPS = [
  "RIDE_TYPE",
  "PREFERENCE",
  "WORK_AREA",
  "VEHICLE",
  "IDENTITY",
  "SELFIE",
  "KIT_NOMINEE",
  "BANK",
];

const PREFERENCE_RULES = {
  TWO_WHEELER: ["FOOD_DELIVERY", "GROCERY_DELIVERY", "BOTH_DELIVERIES"],
  HEAVY_VEHICLE: ["HEAVY_DELIVERY", "SCRAP_PICKER", "BOTH_DELIVERIES"],
};

const TWO_WHEELER_VEHICLES = ["MOTORCYCLE", "EV", "CYCLE"];
const HEAVY_VEHICLES = ["CARGO_3W", "ELECTRIC_CARGO", "COMMERCIAL_4W", "HEAVY_FREIGHT"];

function checkEditable(profile) {
  if (profile.status === "PENDING_REVIEW") {
    throw new AppError("LOCKED_FOR_REVIEW", 409, "Onboarding is submitted and locked for review");
  }
  if (["APPROVED", "REJECTED"].includes(profile.status)) {
    throw new AppError("INVALID_STATE", 409, `Onboarding is in terminal state: ${profile.status}`);
  }
}

function checkPrerequisite(profile, requiredStep) {
  if (!profile.completedSteps.includes(requiredStep)) {
    throw new AppError(
      "STEP_OUT_OF_ORDER",
      409,
      `Step ${requiredStep} must be completed first`,
      { missingStep: requiredStep }
    );
  }
}

function determineCurrentStep(completedSteps = []) {
  for (const step of ALL_STEPS) {
    if (!completedSteps.includes(step)) {
      return step;
    }
  }
  return "COMPLETED";
}

async function getSummary(userId) {
  const [user, profile] = await Promise.all([
    RiderUser.findById(userId).lean(),
    RiderProfile.findOne({ userId }).lean(),
  ]);

  if (!profile) {
    throw new AppError("NOT_FOUND", 404, "Rider profile not found");
  }

  const completedSteps = profile.completedSteps || [];
  const currentStep = determineCurrentStep(completedSteps);
  const canSubmit = completedSteps.length === 8 && Boolean(user?.phone);

  let zoneName = null;
  if (profile.zoneId) {
    const zone = await Zone.findById(profile.zoneId).lean();
    zoneName = zone ? zone.name : null;
  }

  // Work Area block
  const workArea = profile.zoneId
    ? {
        zoneId: profile.zoneId,
        zoneName,
        vehicleType: profile.vehicleType,
        vehicleOwnership: profile.vehicleOwnership,
      }
    : null;

  // Vehicle block
  let vehicle = null;
  if (completedSteps.includes("VEHICLE")) {
    const v = await Vehicle.findOne({ riderId: userId }).lean();
    if (v) {
      vehicle = {
        ownerName: v.ownerName,
        vehicleNumber: v.vehicleNumber,
        brandModel: v.brandModel,
        fuelType: v.fuelType,
        loadCapacity: v.loadCapacity,
        permitType: v.permitType,
        evCategory: v.evCategory,
        cycleType: v.cycleType,
        dlNumber: v.dlNumber,
        dlExpiryDate: v.dlExpiryDate,
        dlBadge: v.dlBadge,
      };
    }
  }

  // Identity block
  let identity = null;
  if (completedSteps.includes("IDENTITY")) {
    const kyc = await KycRecord.findOne({ riderId: userId }).lean();
    if (kyc) {
      identity = {
        idType: kyc.idType,
        status: kyc.status,
        fullName: profile.fullName || kyc.verifiedName,
        aadhaarMasked: kyc.aadhaarLast4 ? `XXXX XXXX ${kyc.aadhaarLast4}` : null,
      };
    }
  }

  // Selfie block
  let selfie = null;
  if (completedSteps.includes("SELFIE")) {
    const s = await SelfieCheck.findOne({ riderId: userId }).sort({ createdAt: -1 }).lean();
    if (s) {
      selfie = {
        status: s.status,
        livenessPassed: s.livenessPassed,
        matchScore: s.matchScore,
      };
    }
  }

  // Kit & Nominee block
  let kitNominee = null;
  if (completedSteps.includes("KIT_NOMINEE")) {
    const [addr, nom] = await Promise.all([
      KitAddress.findOne({ riderId: userId }).lean(),
      InsuranceNominee.findOne({ riderId: userId }).lean(),
    ]);
    if (addr && nom) {
      kitNominee = {
        address: {
          houseNo: addr.houseNo,
          areaStreet: addr.areaStreet,
          pincode: addr.pincode,
          townCity: addr.townCity,
          state: addr.state,
        },
        nominee: {
          nomineeName: nom.nomineeName,
          nomineeRelationship: nom.relationship,
          nomineeDob: nom.dob,
          nomineeMobile: nom.mobile,
          emergencyMobile: nom.emergencyMobile,
        },
        coverage: {
          medicalInr: deliveryEnv.MEDICAL_COVER_INR,
          accidentalLifeInr: deliveryEnv.ACCIDENTAL_COVER_INR,
        },
        kitItems: ["INSULATED_BAG", "TSHIRT_X2"],
      };
    }
  }

  // Bank block
  let bank = null;
  if (completedSteps.includes("BANK")) {
    const b = await BankAccount.findOne({ riderId: userId }).lean();
    if (b) {
      bank = {
        accountNumberMasked: `XXXXXX${b.accountLast4}`,
        ifscCode: b.ifsc,
        bankName: b.bankName,
        branch: b.branch,
        accountType: b.accountType,
        upiId: b.upiId,
        nameMatch: b.nameMatch,
        verificationStatus: b.verificationStatus,
      };
    }
  }

  return {
    status: profile.status,
    currentStep,
    completedSteps,
    canSubmit,
    phone: user?.phone || null,
    rideType: profile.rideType,
    deliveryPreference: profile.deliveryPreference,
    workArea,
    vehicle,
    identity,
    selfie,
    kitNominee,
    bank,
  };
}

async function getStatus(userId) {
  const profile = await RiderProfile.findOne({ userId }).lean();
  if (!profile) {
    throw new AppError("NOT_FOUND", 404, "Rider profile not found");
  }
  return {
    status: profile.status,
    referenceNumber: profile.referenceNumber,
    submittedAt: profile.submittedAt,
    reviewedAt: profile.reviewedAt,
    reviewReason: profile.reviewReason,
    stepsToRedo: profile.stepsToRedo || [],
  };
}

// 1. Save Ride Type
async function saveRideType(userId, rideType) {
  if (rideType === "COURIER") {
    throw new AppError("COURIER_NOT_SUPPORTED", 422, "Courier ride type is not supported");
  }

  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);

  const isChanging = profile.rideType && profile.rideType !== rideType;

  if (isChanging) {
    // Cascade reset rules
    await Promise.all([
      Vehicle.deleteOne({ riderId: userId }),
      RiderDocument.deleteMany({ riderId: userId }),
    ]);

    profile.deliveryPreference = null;
    profile.zoneId = null;
    profile.vehicleType = null;
    profile.vehicleOwnership = null;
    profile.completedSteps = profile.completedSteps.filter(
      (s) => !["PREFERENCE", "WORK_AREA", "VEHICLE"].includes(s)
    );
  }

  profile.rideType = rideType;
  if (!profile.completedSteps.includes("RIDE_TYPE")) {
    profile.completedSteps.push("RIDE_TYPE");
  }

  await profile.save();

  await recordAudit({
    actorUserId: userId,
    action: "RIDE_TYPE_SAVED",
    entity: "rider_profiles",
    entityId: profile._id,
    meta: { rideType },
  });

  return getSummary(userId);
}

// 2. Save Preference
async function savePreference(userId, deliveryPreference) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "RIDE_TYPE");

  const allowed = PREFERENCE_RULES[profile.rideType] || [];
  if (!allowed.includes(deliveryPreference)) {
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      `Delivery preference '${deliveryPreference}' is not valid for ride type '${profile.rideType}'`
    );
  }

  profile.deliveryPreference = deliveryPreference;
  if (!profile.completedSteps.includes("PREFERENCE")) {
    profile.completedSteps.push("PREFERENCE");
  }

  await profile.save();

  await recordAudit({
    actorUserId: userId,
    action: "PREFERENCE_SAVED",
    entity: "rider_profiles",
    entityId: profile._id,
    meta: { deliveryPreference },
  });

  return getSummary(userId);
}

// 3. Save Work Area
async function saveWorkArea(userId, { zoneId, vehicleType, vehicleOwnership }) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "PREFERENCE");

  const zone = await Zone.findById(zoneId);
  if (!zone || !zone.isActive) {
    throw new AppError("NOT_FOUND", 404, "Selected zone does not exist or is inactive");
  }

  if (profile.rideType === "TWO_WHEELER") {
    if (!TWO_WHEELER_VEHICLES.includes(vehicleType)) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        `Vehicle type '${vehicleType}' is not allowed for two-wheeler`
      );
    }
    if (vehicleOwnership) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Vehicle ownership must not be provided for two-wheeler"
      );
    }
  } else if (profile.rideType === "HEAVY_VEHICLE") {
    if (!HEAVY_VEHICLES.includes(vehicleType)) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        `Vehicle type '${vehicleType}' is not allowed for heavy vehicle`
      );
    }
    if (!vehicleOwnership) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "Vehicle ownership is required for heavy vehicles"
      );
    }
  }

  const isVehicleTypeChanging = profile.vehicleType && profile.vehicleType !== vehicleType;
  if (isVehicleTypeChanging) {
    await Promise.all([
      Vehicle.deleteOne({ riderId: userId }),
      RiderDocument.deleteMany({ riderId: userId }),
    ]);
    profile.completedSteps = profile.completedSteps.filter((s) => s !== "VEHICLE");
  }

  profile.zoneId = zoneId;
  profile.vehicleType = vehicleType;
  profile.vehicleOwnership = vehicleOwnership || null;

  if (!profile.completedSteps.includes("WORK_AREA")) {
    profile.completedSteps.push("WORK_AREA");
  }

  await profile.save();

  await recordAudit({
    actorUserId: userId,
    action: "WORK_AREA_SAVED",
    entity: "rider_profiles",
    entityId: profile._id,
    meta: { zoneId, vehicleType, vehicleOwnership },
  });

  return getSummary(userId);
}

// 4. Save Vehicle Details
async function saveVehicle(userId, vehicleData) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "WORK_AREA");

  const vType = profile.vehicleType;
  const isHeavy = HEAVY_VEHICLES.includes(vType);
  const isMotorcycle = vType === "MOTORCYCLE";
  const isEv = vType === "EV";
  const isCycle = vType === "CYCLE";

  // Validate variant fields
  if (isHeavy) {
    if (!vehicleData.ownerName) throw new AppError("VALIDATION_ERROR", 422, "ownerName is required for heavy vehicles");
    if (!vehicleData.fuelType) throw new AppError("VALIDATION_ERROR", 422, "fuelType is required for heavy vehicles");
    if (!vehicleData.loadCapacity) throw new AppError("VALIDATION_ERROR", 422, "loadCapacity is required for heavy vehicles");
    if (!vehicleData.permitType) throw new AppError("VALIDATION_ERROR", 422, "permitType is required for heavy vehicles");
    if (!vehicleData.dlBadge) throw new AppError("VALIDATION_ERROR", 422, "dlBadge is required for heavy vehicles");
  }

  if (isEv && !vehicleData.evCategory) {
    throw new AppError("VALIDATION_ERROR", 422, "evCategory (HIGH_SPEED or LOW_SPEED) is required for EV");
  }

  if (isCycle && !vehicleData.cycleType) {
    throw new AppError("VALIDATION_ERROR", 422, "cycleType is required for cycle");
  }

  const needsDl = isMotorcycle || isHeavy || (isEv && vehicleData.evCategory === "HIGH_SPEED");
  if (needsDl) {
    if (!vehicleData.dlNumber) throw new AppError("VALIDATION_ERROR", 422, "dlNumber is required");
    if (!vehicleData.dlExpiryDate) throw new AppError("VALIDATION_ERROR", 422, "dlExpiryDate is required");
    const expiry = new Date(vehicleData.dlExpiryDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      throw new AppError("VALIDATION_ERROR", 422, "dlExpiryDate must be a valid date in the future");
    }
  }

  let normalizedVehicleNumber = null;
  if (vehicleData.vehicleNumber) {
    normalizedVehicleNumber = vehicleData.vehicleNumber.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(normalizedVehicleNumber)) {
      throw new AppError("VALIDATION_ERROR", 422, "Invalid vehicle number format");
    }

    const duplicate = await Vehicle.findOne({
      vehicleNumber: normalizedVehicleNumber,
      riderId: { $ne: userId },
    });
    if (duplicate) {
      throw new AppError("VEHICLE_ALREADY_REGISTERED", 409, "Vehicle number is already registered to another rider");
    }
  }

  // Validate documents
  const docs = vehicleData.documents || {};
  const docFileIds = Object.values(docs).filter(Boolean);

  for (const [docName, fileId] of Object.entries(docs)) {
    if (!fileId) continue;
    const fileRec = await FileRecord.findOne({ _id: fileId, ownerUserId: userId });
    if (!fileRec) {
      throw new AppError("FILE_NOT_FOUND", 404, `File for ${docName} not found or does not belong to user`);
    }
  }

  // Save in transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Vehicle.findOneAndUpdate(
        { riderId: userId },
        {
          ownerName: vehicleData.ownerName || null,
          vehicleNumber: normalizedVehicleNumber,
          brandModel: vehicleData.brandModel,
          fuelType: vehicleData.fuelType || (isMotorcycle ? "PETROL" : null),
          loadCapacity: vehicleData.loadCapacity || null,
          permitType: vehicleData.permitType || null,
          evCategory: vehicleData.evCategory || null,
          cycleType: vehicleData.cycleType || null,
          dlNumber: vehicleData.dlNumber ? vehicleData.dlNumber.toUpperCase().replace(/[\s-]/g, "") : null,
          dlBadge: vehicleData.dlBadge || null,
          dlExpiryDate: vehicleData.dlExpiryDate ? new Date(vehicleData.dlExpiryDate) : null,
        },
        { upsert: true, new: true, session }
      );

      // Upsert rider documents
      for (const [docType, fileId] of Object.entries(docs)) {
        if (!fileId) continue;
        await RiderDocument.findOneAndUpdate(
          { riderId: userId, docType },
          { fileId, verificationStatus: "PENDING" },
          { upsert: true, new: true, session }
        );
      }

      await RiderProfile.findOneAndUpdate(
        { userId },
        { $addToSet: { completedSteps: "VEHICLE" } },
        { session }
      );
    });
  } catch (err) {
    await session.endSession();
    if (err.code === 11000) {
      throw new AppError("VEHICLE_ALREADY_REGISTERED", 409, "Vehicle number is already registered to another rider");
    }
    throw err;
  }
  await session.endSession();

  await recordAudit({
    actorUserId: userId,
    action: "VEHICLE_SAVED",
    entity: "vehicles",
    entityId: userId,
  });

  return getSummary(userId);
}

// 5. Identity: Aadhaar Send OTP
async function aadhaarSendOtp(userId, aadhaarNumber) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "VEHICLE");

  const cleanNumber = String(aadhaarNumber).replace(/\s/g, "");
  if (!/^\d{12}$/.test(cleanNumber) || !validateVerhoeff(cleanNumber)) {
    throw new AppError("AADHAAR_INVALID", 422, "Aadhaar number must be 12 digits and pass Verhoeff checksum");
  }

  const result = await kycProvider.aadhaarSendOtp(cleanNumber);

  await KycRecord.findOneAndUpdate(
    { riderId: userId },
    {
      idType: "AADHAAR",
      providerRef: result.referenceId,
      aadhaarLast4: cleanNumber.slice(-4),
      aadhaarHmac: hmacSha256(cleanNumber, deliveryEnv.AADHAAR_HMAC_KEY),
      otpAttempts: 0,
    },
    { upsert: true, new: true }
  );

  return result;
}

// 5b. Identity: Aadhaar Verify OTP
async function aadhaarVerifyOtp(userId, { referenceId, otp, aadhaarFileId }) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "VEHICLE");

  const kyc = await KycRecord.findOne({ riderId: userId, providerRef: referenceId });
  if (!kyc) {
    throw new AppError("NOT_FOUND", 404, "No active Aadhaar verification session found");
  }

  if (kyc.otpAttempts >= 3) {
    throw new AppError(
      "OTP_ATTEMPTS_EXCEEDED",
      429,
      "Maximum Aadhaar OTP attempts exceeded. Please send a new OTP."
    );
  }

  // Check unique HMAC against other riders
  if (kyc.aadhaarHmac) {
    const duplicate = await KycRecord.findOne({
      aadhaarHmac: kyc.aadhaarHmac,
      riderId: { $ne: userId },
    });
    if (duplicate) {
      throw new AppError("IDENTITY_ALREADY_REGISTERED", 409, "This Aadhaar number is already registered to another rider");
    }
  }

  const verifyResult = await kycProvider.aadhaarVerifyOtp(referenceId, otp);
  if (!verifyResult.verified) {
    const updated = await KycRecord.findByIdAndUpdate(
      kyc._id,
      { $inc: { otpAttempts: 1 } },
      { new: true }
    );
    if (updated.otpAttempts >= 3) {
      throw new AppError("OTP_ATTEMPTS_EXCEEDED", 429, "Maximum attempts exceeded");
    }
    throw new AppError("OTP_INVALID", 422, "Invalid Aadhaar OTP");
  }

  // Transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await KycRecord.findByIdAndUpdate(
        kyc._id,
        {
          status: "VERIFIED",
          verifiedName: verifyResult.name,
          verifiedAt: new Date(),
          documentFileId: aadhaarFileId || null,
        },
        { session }
      );

      await RiderProfile.findOneAndUpdate(
        { userId },
        {
          fullName: verifyResult.name,
          $addToSet: { completedSteps: "IDENTITY" },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorUserId: userId,
    action: "AADHAAR_VERIFIED",
    entity: "kyc_records",
    entityId: kyc._id,
  });

  return {
    idType: "AADHAAR",
    status: "VERIFIED",
    name: verifyResult.name,
    aadhaarMasked: `XXXX XXXX ${kyc.aadhaarLast4}`,
  };
}

// 5c. Identity: PAN + Address
async function savePanIdentity(userId, { panNumber, fullName, address, panFileId }) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "VEHICLE");

  const fileRec = await FileRecord.findOne({ _id: panFileId, ownerUserId: userId });
  if (!fileRec || fileRec.purpose !== "PAN_DOC") {
    throw new AppError("FILE_NOT_FOUND", 404, "Valid PAN document file is required");
  }

  const panResult = await kycProvider.verifyPan(panNumber, fullName);
  const status = panResult.verified ? "VERIFIED" : "SUBMITTED";
  const panEncrypted = encryptAesGcm(panNumber, deliveryEnv.DATA_ENCRYPTION_KEY, deliveryEnv.DATA_ENCRYPTION_KEY_ID);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await KycRecord.findOneAndUpdate(
        { riderId: userId },
        {
          idType: "PAN_ADDRESS",
          status,
          panNumberEnc: panEncrypted,
          panName: fullName,
          addressText: address,
          documentFileId: panFileId,
          verifiedName: fullName,
          verifiedAt: status === "VERIFIED" ? new Date() : null,
        },
        { upsert: true, new: true, session }
      );

      await RiderProfile.findOneAndUpdate(
        { userId },
        {
          fullName,
          $addToSet: { completedSteps: "IDENTITY" },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorUserId: userId,
    action: "PAN_IDENTITY_SAVED",
    entity: "kyc_records",
    entityId: userId,
  });

  return getSummary(userId);
}

// 6. Selfie
async function saveSelfie(userId, { fileId, clientFaceDetected }) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "IDENTITY");

  const fileRec = await FileRecord.findOne({ _id: fileId, ownerUserId: userId });
  if (!fileRec || fileRec.purpose !== "SELFIE") {
    throw new AppError("FILE_NOT_FOUND", 404, "Selfie file not found or invalid purpose");
  }

  // Check 5 daily attempts
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const attemptsCount = await SelfieCheck.countDocuments({
    riderId: userId,
    createdAt: { $gte: oneDayAgo },
  });

  if (attemptsCount >= deliveryEnv.SELFIE_MAX_ATTEMPTS_PER_DAY) {
    throw new AppError("RATE_LIMITED", 429, "Maximum daily selfie attempts reached");
  }

  const kyc = await KycRecord.findOne({ riderId: userId });
  const isPanPath = kyc?.idType === "PAN_ADDRESS";

  const checkResult = await faceMatchProvider.check(fileRec);

  if (!checkResult.passed) {
    await SelfieCheck.create({
      riderId: userId,
      fileId,
      status: "FAILED",
      livenessPassed: checkResult.livenessPassed,
      matchScore: checkResult.matchScore,
      reasonCode: checkResult.reasonCode || "NO_FACE",
      needsManualReview: false,
    });

    throw new AppError("SELFIE_REJECTED", 422, "Selfie verification failed", {
      reason: checkResult.reasonCode || "NO_FACE",
    });
  }

  await SelfieCheck.create({
    riderId: userId,
    fileId,
    status: "PASSED",
    livenessPassed: checkResult.livenessPassed,
    matchScore: checkResult.matchScore,
    reasonCode: null,
    needsManualReview: isPanPath,
  });

  await RiderProfile.findOneAndUpdate(
    { userId },
    { $addToSet: { completedSteps: "SELFIE" } }
  );

  await recordAudit({
    actorUserId: userId,
    action: "SELFIE_SAVED",
    entity: "selfie_checks",
    entityId: userId,
  });

  return getSummary(userId);
}

// 7. Kit & Nominee
async function saveKitNominee(userId, { address, nominee }) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "SELFIE");

  const user = await RiderUser.findById(userId);
  if (user?.phone && nominee.emergencyMobile === user.phone) {
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Emergency contact cannot be equal to rider phone number",
      [{ field: "nominee.emergencyMobile", message: "Emergency mobile must not equal rider phone" }]
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await KitAddress.findOneAndUpdate(
        { riderId: userId },
        {
          houseNo: address.houseNo.trim(),
          areaStreet: address.areaStreet.trim(),
          pincode: address.pincode.trim(),
          townCity: address.townCity.trim(),
          state: address.state.trim(),
        },
        { upsert: true, new: true, session }
      );

      await InsuranceNominee.findOneAndUpdate(
        { riderId: userId },
        {
          nomineeName: nominee.nomineeName.trim(),
          relationship: nominee.nomineeRelationship,
          dob: nominee.nomineeDob,
          mobile: nominee.nomineeMobile.trim(),
          emergencyMobile: nominee.emergencyMobile.trim(),
        },
        { upsert: true, new: true, session }
      );

      await RiderProfile.findOneAndUpdate(
        { userId },
        { $addToSet: { completedSteps: "KIT_NOMINEE" } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorUserId: userId,
    action: "KIT_NOMINEE_SAVED",
    entity: "kit_addresses",
    entityId: userId,
  });

  return getSummary(userId);
}

// 8. Bank & UPI
async function verifyUpi(userId, upiId) {
  const result = await bankProvider.verifyUpi(upiId);
  if (!result.valid) {
    throw new AppError("UPI_INVALID", 422, "Invalid UPI ID");
  }

  const record = await UpiVerification.create({
    riderId: userId,
    upiId,
    valid: true,
    registeredName: result.registeredName,
  });

  return {
    upiVerificationId: record._id.toString(),
    valid: true,
    registeredName: result.registeredName,
  };
}

async function saveBank(
  userId,
  { accountNumber, ifscCode, accountType, passbookFileId, upiVerificationId }
) {
  const profile = await RiderProfile.findOne({ userId });
  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");
  checkEditable(profile);
  checkPrerequisite(profile, "KIT_NOMINEE");

  // Validate upiVerificationId
  const upiRecord = await UpiVerification.findOne({
    _id: upiVerificationId,
    riderId: userId,
    valid: true,
  });
  if (!upiRecord) {
    throw new AppError("NOT_FOUND", 404, "Valid UPI verification record not found");
  }
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (upiRecord.createdAt < thirtyMinutesAgo) {
    throw new AppError("VALIDATION_ERROR", 422, "UPI verification has expired (valid for 30 minutes)");
  }

  // Validate passbook file
  const passbookFile = await FileRecord.findOne({
    _id: passbookFileId,
    ownerUserId: userId,
    purpose: "PASSBOOK",
  });
  if (!passbookFile) {
    throw new AppError("FILE_NOT_FOUND", 404, "Passbook document not found or invalid purpose");
  }

  // Lookup IFSC
  const bankInfo = await bankProvider.lookupIfsc(ifscCode);
  if (!bankInfo) {
    throw new AppError("IFSC_NOT_FOUND", 404, "IFSC code could not be resolved");
  }

  // Verify account (penny drop)
  const acctResult = await bankProvider.verifyAccount(accountNumber, ifscCode);
  if (!acctResult.valid) {
    throw new AppError("BANK_ACCOUNT_INVALID", 422, "Bank account verification failed");
  }

  // Name match check
  const kycName = profile.fullName || "";
  const holderName = acctResult.registeredName || "";
  const matchScore = calculateTokenOverlap(kycName, holderName);
  const nameMatch = matchScore >= 0.6 ? "MATCHED" : "MISMATCH";

  const encAccount = encryptAesGcm(
    accountNumber,
    deliveryEnv.DATA_ENCRYPTION_KEY,
    deliveryEnv.DATA_ENCRYPTION_KEY_ID
  );
  const accountLast4 = accountNumber.slice(-4);

  await BankAccount.findOneAndUpdate(
    { riderId: userId },
    {
      accountNumberEnc: encAccount,
      accountLast4,
      ifsc: ifscCode,
      bankName: bankInfo.bankName,
      branch: bankInfo.branch,
      accountType,
      passbookFileId,
      holderName,
      nameMatch,
      verificationStatus: "VERIFIED",
      upiId: upiRecord.upiId,
      upiRegisteredName: upiRecord.registeredName,
      upiVerifiedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  await RiderProfile.findOneAndUpdate(
    { userId },
    { $addToSet: { completedSteps: "BANK" } }
  );

  await recordAudit({
    actorUserId: userId,
    action: "BANK_SAVED",
    entity: "bank_accounts",
    entityId: userId,
  });

  return getSummary(userId);
}

// 9. Submit Onboarding
async function submitOnboarding(userId) {
  const [user, profile] = await Promise.all([
    RiderUser.findById(userId),
    RiderProfile.findOne({ userId }),
  ]);

  if (!profile) throw new AppError("NOT_FOUND", 404, "Profile not found");

  if (profile.status === "APPROVED") {
    throw new AppError("ALREADY_APPROVED", 409, "Rider onboarding is already approved");
  }

  if (profile.status === "PENDING_REVIEW") {
    return {
      status: "PENDING_REVIEW",
      referenceNumber: profile.referenceNumber,
      submittedAt: profile.submittedAt,
    };
  }

  if (!user.phone) {
    throw new AppError("PHONE_REQUIRED", 422, "A registered phone number is required before submission");
  }

  const missingSteps = ALL_STEPS.filter((step) => !profile.completedSteps.includes(step));
  if (missingSteps.length > 0) {
    throw new AppError(
      "ONBOARDING_INCOMPLETE",
      422,
      "All 8 onboarding steps must be completed before submission",
      { missingSteps }
    );
  }

  let referenceNumber = profile.referenceNumber;
  const currentYear = new Date().getFullYear();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (!referenceNumber) {
        const counter = await Counter.findOneAndUpdate(
          { _id: `rider_ref_${currentYear}` },
          { $inc: { seq: 1 } },
          { upsert: true, new: true, session }
        );
        const seqFormatted = String(counter.seq).padStart(6, "0");
        referenceNumber = `RDR-${currentYear}-${seqFormatted}`;
      }

      await RiderProfile.findOneAndUpdate(
        {
          userId,
          status: { $in: ["IN_PROGRESS", "CHANGES_REQUESTED"] },
        },
        {
          status: "PENDING_REVIEW",
          referenceNumber,
          submittedAt: new Date(),
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorUserId: userId,
    action: "ONBOARDING_SUBMITTED",
    entity: "rider_profiles",
    entityId: profile._id,
    meta: { referenceNumber },
  });

  return {
    status: "PENDING_REVIEW",
    referenceNumber,
    submittedAt: new Date(),
  };
}

module.exports = {
  getSummary,
  getStatus,
  saveRideType,
  savePreference,
  saveWorkArea,
  saveVehicle,
  aadhaarSendOtp,
  aadhaarVerifyOtp,
  savePanIdentity,
  saveSelfie,
  saveKitNominee,
  verifyUpi,
  saveBank,
  submitOnboarding,
};
