const { z } = require("zod");

const INDIAN_STATES_AND_UTS = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const mobileRegex = /^[6-9][0-9]{9}$/;
const pincodeRegex = /^[1-9][0-9]{5}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const upiRegex = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

// Ride Type Schema
const rideTypeSchema = z
  .object({
    rideType: z.enum(["TWO_WHEELER", "HEAVY_VEHICLE", "COURIER"], {
      errorMap: () => ({ message: "rideType must be TWO_WHEELER, HEAVY_VEHICLE or COURIER" }),
    }),
  })
  .strict();

// Delivery Preference Schema
const preferenceSchema = z
  .object({
    deliveryPreference: z.enum(
      [
        "FOOD_DELIVERY",
        "GROCERY_DELIVERY",
        "BOTH_DELIVERIES",
        "HEAVY_DELIVERY",
        "SCRAP_PICKER",
      ],
      {
        errorMap: () => ({ message: "Invalid deliveryPreference" }),
      }
    ),
  })
  .strict();

// Work Area Schema
const workAreaSchema = z
  .object({
    zoneId: z.string().min(1, "zoneId is required"),
    vehicleType: z.enum([
      "MOTORCYCLE",
      "EV",
      "CYCLE",
      "CARGO_3W",
      "ELECTRIC_CARGO",
      "COMMERCIAL_4W",
      "HEAVY_FREIGHT",
    ]),
    vehicleOwnership: z
      .enum(["SELF_OWNED", "RENTED_LEASED", "FLEET_COMPANY"])
      .optional()
      .nullable(),
  })
  .strict();

// Vehicle Schema
const vehicleSchema = z
  .object({
    ownerName: z.string().trim().min(2).max(100).optional().nullable(),
    vehicleNumber: z.string().trim().optional().nullable(),
    brandModel: z.string().trim().min(2).max(80),
    fuelType: z.enum(["PETROL", "DIESEL", "CNG", "ELECTRIC_HEAVY"]).optional().nullable(),
    loadCapacity: z.string().trim().max(30).optional().nullable(),
    permitType: z.enum(["INTRA_STATE", "NATIONAL_PERMIT"]).optional().nullable(),
    evCategory: z.enum(["HIGH_SPEED", "LOW_SPEED"]).optional().nullable(),
    cycleType: z.enum(["STANDARD", "ELECTRIC"]).optional().nullable(),
    dlNumber: z.string().trim().optional().nullable(),
    dlExpiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dlExpiryDate must be YYYY-MM-DD")
      .optional()
      .nullable(),
    dlBadge: z.string().trim().max(100).optional().nullable(),
    documents: z.record(z.string()).default({}),
  })
  .strict();

// Identity Schemas
const aadhaarSendOtpSchema = z
  .object({
    aadhaarNumber: z.string().trim().min(1, "aadhaarNumber is required"),
  })
  .strict();

const aadhaarVerifyOtpSchema = z
  .object({
    referenceId: z.string().min(1, "referenceId is required"),
    otp: z.string().trim().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
    aadhaarFileId: z.string().optional().nullable(),
  })
  .strict();

const panIdentitySchema = z
  .object({
    panNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(panRegex, "Must be a valid 10-character PAN"),
    fullName: z.string().trim().min(2).max(100),
    address: z.string().trim().min(10).max(300),
    panFileId: z.string().min(1, "panFileId is required"),
  })
  .strict();

// Selfie Schema
const selfieSchema = z
  .object({
    fileId: z.string().min(1, "fileId is required"),
    clientFaceDetected: z.boolean(),
  })
  .strict();

// Kit & Nominee Schema
const kitNomineeSchema = z
  .object({
    address: z
      .object({
        houseNo: z.string().trim().min(1).max(150),
        areaStreet: z.string().trim().min(1).max(200),
        pincode: z.string().trim().regex(pincodeRegex, "pincode must be 6 digits"),
        townCity: z.string().trim().min(1).max(80),
        state: z.enum(INDIAN_STATES_AND_UTS, {
          errorMap: () => ({ message: "state must be a valid Indian state or UT" }),
        }),
      })
      .strict(),
    nominee: z
      .object({
        nomineeName: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .regex(/^[a-zA-Z\s.-]+$/, "nomineeName allows only letters, spaces, dots and hyphens"),
        nomineeRelationship: z.enum([
          "SPOUSE",
          "FATHER",
          "MOTHER",
          "SON",
          "DAUGHTER",
          "BROTHER",
          "SISTER",
          "OTHER",
        ]),
        nomineeDob: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "nomineeDob must be YYYY-MM-DD")
          .refine((dob) => {
            const date = new Date(dob);
            if (isNaN(date.getTime())) return false;
            const now = new Date();
            if (date >= now) return false;
            const ageYears = (now - date) / (365.25 * 24 * 3600 * 1000);
            return ageYears <= 120;
          }, "nomineeDob must be a date in the past, not more than 120 years ago"),
        nomineeMobile: z
          .string()
          .trim()
          .regex(mobileRegex, "nomineeMobile must be a valid 10-digit Indian mobile number"),
        emergencyMobile: z
          .string()
          .trim()
          .regex(mobileRegex, "emergencyMobile must be a valid 10-digit Indian mobile number"),
      })
      .strict(),
  })
  .strict();

// Bank Schemas
const ifscParamSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(ifscRegex, "Invalid IFSC code format"),
  })
  .strict();

const upiVerifySchema = z
  .object({
    upiId: z.string().trim().regex(upiRegex, "Invalid UPI ID format"),
  })
  .strict();

const bankSchema = z
  .object({
    accountNumber: z.string().trim().regex(/^\d{9,18}$/, "accountNumber must be 9 to 18 digits"),
    confirmAccountNumber: z.string().trim(),
    ifscCode: z.string().trim().toUpperCase().regex(ifscRegex, "Invalid IFSC code format"),
    accountType: z.enum(["SAVINGS", "CURRENT"]),
    passbookFileId: z.string().min(1, "passbookFileId is required"),
    upiVerificationId: z.string().min(1, "upiVerificationId is required"),
  })
  .strict()
  .refine((data) => data.accountNumber === data.confirmAccountNumber, {
    message: "confirmAccountNumber must match accountNumber",
    path: ["confirmAccountNumber"],
  });

// Admin Review Schema
const adminReviewSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
    reason: z.string().trim().optional(),
    stepsToRedo: z
      .array(
        z.enum([
          "RIDE_TYPE",
          "PREFERENCE",
          "WORK_AREA",
          "VEHICLE",
          "IDENTITY",
          "SELFIE",
          "KIT_NOMINEE",
          "BANK",
        ])
      )
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.decision !== "APPROVE" && (!data.reason || data.reason.trim().length === 0)) {
        return false;
      }
      return true;
    },
    { message: "reason is required for REJECT and REQUEST_CHANGES", path: ["reason"] }
  )
  .refine(
    (data) => {
      if (data.decision === "REQUEST_CHANGES" && (!data.stepsToRedo || data.stepsToRedo.length === 0)) {
        return false;
      }
      return true;
    },
    { message: "stepsToRedo is required when requesting changes", path: ["stepsToRedo"] }
  );

module.exports = {
  INDIAN_STATES_AND_UTS,
  rideTypeSchema,
  preferenceSchema,
  workAreaSchema,
  vehicleSchema,
  aadhaarSendOtpSchema,
  aadhaarVerifyOtpSchema,
  panIdentitySchema,
  selfieSchema,
  kitNomineeSchema,
  ifscParamSchema,
  upiVerifySchema,
  bankSchema,
  adminReviewSchema,
};
