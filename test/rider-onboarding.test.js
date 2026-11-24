const test = require("node:test");
const assert = require("node:assert/strict");
const { validateVerhoeff, generateVerhoeff } = require("../src/modules/delivery/lib/verhoeff");
const { calculateTokenOverlap } = require("../src/modules/delivery/lib/tokenOverlap");
const {
  encryptAesGcm,
  decryptAesGcm,
  hmacSha256,
  constantTimeCompare,
} = require("../src/modules/delivery/lib/crypto");
const { sniffMimeType } = require("../src/modules/delivery/uploads/sniffMime");
const {
  rideTypeSchema,
  preferenceSchema,
  workAreaSchema,
  vehicleSchema,
  aadhaarSendOtpSchema,
  panIdentitySchema,
  kitNomineeSchema,
  ifscParamSchema,
  upiVerifySchema,
  bankSchema,
  adminReviewSchema,
} = require("../src/modules/delivery/onboarding/onboarding.validation");
const { contactSchema } = require("../src/modules/delivery/auth/auth.validation");
const AppError = require("../src/modules/delivery/lib/AppError");

// ==========================================
// 1. Verhoeff Checksum Algorithm Tests
// ==========================================
test("Verhoeff checksum: correctly validates valid Aadhaar numbers and check digits", () => {
  // 21983746123 is base, let's verify checksum calculation
  const base = "21983746123";
  const checkDigit = generateVerhoeff(base);
  const fullAadhaar = `${base}${checkDigit}`;

  assert.equal(validateVerhoeff(fullAadhaar), true);
  // Any modified digit fails checksum
  const tampered = `${base}${(checkDigit + 1) % 10}`;
  assert.equal(validateVerhoeff(tampered), false);
  // Non-digit fails
  assert.equal(validateVerhoeff("21983746123A"), false);
  assert.equal(validateVerhoeff(""), false);
});

// ==========================================
// 2. Token Overlap Name Matching Tests
// ==========================================
test("Token Overlap: calculates normalized token score correctly", () => {
  // Exact match
  assert.equal(calculateTokenOverlap("Pooja Sharma", "Pooja Sharma"), 1.0);
  // High overlap with honorific (2 tokens out of 3 total -> score >= 0.6)
  const score1 = calculateTokenOverlap("Mrs. Pooja Sharma", "Pooja Sharma");
  assert.ok(score1 >= 0.6, `Expected >= 0.6, got ${score1}`);
  // Completely different names -> score < 0.6
  const score2 = calculateTokenOverlap("Pooja Sharma", "Rahul Verma");
  assert.equal(score2, 0.0);
  // Edge cases
  assert.equal(calculateTokenOverlap("", "Test"), 0.0);
});

// ==========================================
// 3. AES-256-GCM Encryption Tests
// ==========================================
test("AES-256-GCM: encrypts and decrypts with key ID preserved for rotation", () => {
  const secretKey = "01234567890123456789012345678901";
  const plaintext = "9876543210123456";
  const encrypted = encryptAesGcm(plaintext, secretKey, "k1");

  assert.ok(encrypted.startsWith("k1:"), "Ciphertext must contain key ID prefix");
  const decrypted = decryptAesGcm(encrypted, secretKey);
  assert.equal(decrypted, plaintext);

  // Decryption with wrong key fails
  assert.throws(() => {
    decryptAesGcm(encrypted, "wrong-key-00000000000000000000000");
  });
});

// ==========================================
// 4. HMAC and Constant Time Compare Tests
// ==========================================
test("HMAC-SHA256 and timingSafeEqual behavior", () => {
  const key = "test-secret-key-32-chars-minimum-length";
  const val = "219837461230";
  const hash1 = hmacSha256(val, key);
  const hash2 = hmacSha256(val, key);
  assert.equal(hash1, hash2);

  assert.equal(constantTimeCompare("secret123", "secret123"), true);
  assert.equal(constantTimeCompare("secret123", "secret456"), false);
  assert.equal(constantTimeCompare("short", "longer-string"), false);
});

// ==========================================
// 5. File Content Sniffing Tests
// ==========================================
test("sniffMimeType: correctly identifies JPEG, PNG, WebP, and PDF magic bytes", () => {
  // JPEG: FF D8 FF
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.equal(sniffMimeType(jpegBuf), "image/jpeg");

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.equal(sniffMimeType(pngBuf), "image/png");

  // WebP: RIFF ... WEBP
  const webpBuf = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(sniffMimeType(webpBuf), "image/webp");

  // PDF: %PDF
  const pdfBuf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  assert.equal(sniffMimeType(pdfBuf), "application/pdf");

  // Invalid / unknown
  const badBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  assert.equal(sniffMimeType(badBuf), null);
});

// ==========================================
// 6. Validation Schemas Tests (Section 8 Quick Reference)
// ==========================================
test("Validation: Mobile number regex (^ [6-9][0-9]{9} $)", () => {
  assert.equal(contactSchema.safeParse({ phone: "9876543210" }).success, true);
  assert.equal(contactSchema.safeParse({ phone: "5876543210" }).success, false); // starts with 5
  assert.equal(contactSchema.safeParse({ phone: "987654321" }).success, false); // 9 digits
  assert.equal(contactSchema.safeParse({ phone: "98765432100" }).success, false); // 11 digits
});

test("Validation: PAN regex (^[A-Z]{5}[0-9]{4}[A-Z]$)", () => {
  const valid = {
    panNumber: "ABCDE1234F",
    fullName: "Asha Sharma",
    address: "Plot 12, Main Street, Hyderabad",
    panFileId: "507f1f77bcf86cd799439011",
  };
  assert.equal(panIdentitySchema.safeParse(valid).success, true);

  const invalidPan = { ...valid, panNumber: "ABC123456F" };
  assert.equal(panIdentitySchema.safeParse(invalidPan).success, false);
});

test("Validation: IFSC regex (^[A-Z]{4}0[A-Z0-9]{6}$)", () => {
  assert.equal(ifscParamSchema.safeParse({ code: "SBIN0001234" }).success, true);
  assert.equal(ifscParamSchema.safeParse({ code: "sbin0001234" }).success, true); // normalized uppercase
  assert.equal(ifscParamSchema.safeParse({ code: "SBIN1001234" }).success, false); // 5th char not 0
  assert.equal(ifscParamSchema.safeParse({ code: "SBI0001234" }).success, false); // short
});

test("Validation: UPI ID regex", () => {
  assert.equal(upiVerifySchema.safeParse({ upiId: "rider@oksbi" }).success, true);
  assert.equal(upiVerifySchema.safeParse({ upiId: "rider.name_1@icici" }).success, true);
  assert.equal(upiVerifySchema.safeParse({ upiId: "@7060858219" }).success, false); // prototype bug
  assert.equal(upiVerifySchema.safeParse({ upiId: "invalid-upi" }).success, false);
});

test("Validation: Kit and Nominee constraints", () => {
  const valid = {
    address: {
      houseNo: "Flat 402",
      areaStreet: "Sector 4, Main Road",
      pincode: "500098",
      townCity: "Hyderabad",
      state: "Telangana",
    },
    nominee: {
      nomineeName: "Pooja Sharma",
      nomineeRelationship: "SPOUSE",
      nomineeDob: "1994-08-16",
      nomineeMobile: "9876543210",
      emergencyMobile: "9812345678",
    },
  };
  assert.equal(kitNomineeSchema.safeParse(valid).success, true);

  // Bad pincode
  const badPincode = JSON.parse(JSON.stringify(valid));
  badPincode.address.pincode = "012345";
  assert.equal(kitNomineeSchema.safeParse(badPincode).success, false);

  // Future DOB
  const futureDob = JSON.parse(JSON.stringify(valid));
  futureDob.nominee.nomineeDob = "2099-01-01";
  assert.equal(kitNomineeSchema.safeParse(futureDob).success, false);

  // Unknown relationship
  const badRel = JSON.parse(JSON.stringify(valid));
  badRel.nominee.nomineeRelationship = "NEIGHBOR";
  assert.equal(kitNomineeSchema.safeParse(badRel).success, false);
});

test("Validation: Bank account matching confirmation", () => {
  const valid = {
    accountNumber: "123456789012",
    confirmAccountNumber: "123456789012",
    ifscCode: "SBIN0001234",
    accountType: "SAVINGS",
    passbookFileId: "507f1f77bcf86cd799439011",
    upiVerificationId: "507f1f77bcf86cd799439012",
  };
  assert.equal(bankSchema.safeParse(valid).success, true);

  const mismatch = { ...valid, confirmAccountNumber: "999999999999" };
  assert.equal(bankSchema.safeParse(mismatch).success, false);
});

test("Validation: Admin review schema rules", () => {
  // APPROVE without reason is valid
  assert.equal(adminReviewSchema.safeParse({ decision: "APPROVE" }).success, true);

  // REJECT requires reason
  assert.equal(adminReviewSchema.safeParse({ decision: "REJECT" }).success, false);
  assert.equal(
    adminReviewSchema.safeParse({ decision: "REJECT", reason: "Invalid KYC documents" }).success,
    true
  );

  // REQUEST_CHANGES requires reason and stepsToRedo
  assert.equal(
    adminReviewSchema.safeParse({ decision: "REQUEST_CHANGES", reason: "Blurry selfie" }).success,
    false
  );
  assert.equal(
    adminReviewSchema.safeParse({
      decision: "REQUEST_CHANGES",
      reason: "Blurry selfie",
      stepsToRedo: ["SELFIE"],
    }).success,
    true
  );
});

// ==========================================
// 7. AppError & HTTP Status Mapping
// ==========================================
test("AppError: formats correctly with code, httpStatus, message, details", () => {
  const err = new AppError("VALIDATION_ERROR", 422, "Invalid input", [
    { field: "pincode", message: "Must be 6 digits" },
  ]);
  assert.equal(err.code, "VALIDATION_ERROR");
  assert.equal(err.httpStatus, 422);
  assert.equal(err.message, "Invalid input");
  assert.deepEqual(err.details, [{ field: "pincode", message: "Must be 6 digits" }]);
});

// ==========================================
// 8. NoSQL Injection Sanitizer Tests
// ==========================================
const noSqlSanitizer = require("../src/modules/delivery/middleware/noSqlSanitizer.middleware");

test("NoSQL Sanitizer: blocks keys with $ or dot", () => {
  let errorCaught = null;
  const mockReq = {
    body: { email: { $ne: null } },
  };
  const mockRes = {};
  const mockNext = (err) => {
    errorCaught = err;
  };

  noSqlSanitizer(mockReq, mockRes, mockNext);
  assert.ok(errorCaught instanceof AppError);
  assert.equal(errorCaught.code, "VALIDATION_ERROR");
  assert.equal(errorCaught.httpStatus, 422);

  // Clean payload passes
  let passedClean = false;
  noSqlSanitizer({ body: { email: "test@example.com" } }, {}, (err) => {
    assert.equal(err, undefined);
    passedClean = true;
  });
  assert.equal(passedClean, true);
});

// ==========================================
// 9. State Machine Step Order & Reset Rules Tests
// ==========================================
const {
  saveRideType,
  savePreference,
  saveWorkArea,
} = require("../src/modules/delivery/onboarding/onboarding.service");
const { RiderProfile, Zone } = require("../src/modules/delivery/models");

test("State Machine: Step out of order rejection", async () => {
  const originalFindOne = RiderProfile.findOne;
  const mockProfile = {
    userId: "507f1f77bcf86cd799439011",
    status: "IN_PROGRESS",
    completedSteps: [], // RIDE_TYPE not completed yet
    save: async () => {},
  };
  RiderProfile.findOne = async () => mockProfile;

  try {
    await assert.rejects(
      async () => {
        await savePreference("507f1f77bcf86cd799439011", "FOOD_DELIVERY");
      },
      (err) => {
        assert.equal(err.code, "STEP_OUT_OF_ORDER");
        assert.equal(err.httpStatus, 409);
        assert.equal(err.details.missingStep, "RIDE_TYPE");
        return true;
      }
    );
  } finally {
    RiderProfile.findOne = originalFindOne;
  }
});

test("State Machine: Locked for review rejection", async () => {
  const originalFindOne = RiderProfile.findOne;
  const mockProfile = {
    userId: "507f1f77bcf86cd799439011",
    status: "PENDING_REVIEW", // Submitted and locked
    completedSteps: ["RIDE_TYPE"],
    save: async () => {},
  };
  RiderProfile.findOne = async () => mockProfile;

  try {
    await assert.rejects(
      async () => {
        await saveRideType("507f1f77bcf86cd799439011", "TWO_WHEELER");
      },
      (err) => {
        assert.equal(err.code, "LOCKED_FOR_REVIEW");
        assert.equal(err.httpStatus, 409);
        return true;
      }
    );
  } finally {
    RiderProfile.findOne = originalFindOne;
  }
});

test("State Machine: Courier ride type rejection", async () => {
  await assert.rejects(
    async () => {
      await saveRideType("507f1f77bcf86cd799439011", "COURIER");
    },
    (err) => {
      assert.equal(err.code, "COURIER_NOT_SUPPORTED");
      assert.equal(err.httpStatus, 422);
      return true;
    }
  );
});
