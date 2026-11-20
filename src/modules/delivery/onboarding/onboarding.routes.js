const express = require("express");
const onboardingController = require("./onboarding.controller");
const {
  rideTypeSchema,
  preferenceSchema,
  workAreaSchema,
  vehicleSchema,
  aadhaarSendOtpSchema,
  aadhaarVerifyOtpSchema,
  panIdentitySchema,
  selfieSchema,
  kitNomineeSchema,
  upiVerifySchema,
  bankSchema,
} = require("./onboarding.validation");
const { contactSchema } = require("../auth/auth.validation");
const riderAuth = require("../middleware/riderAuth.middleware");
const validate = require("../middleware/validate.middleware");
const idempotencyMiddleware = require("../middleware/idempotency.middleware");
const { generalRateLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

// Summary & Status
router.get("/", riderAuth, generalRateLimiter, onboardingController.getSummary);
router.get("/status", riderAuth, generalRateLimiter, onboardingController.getStatus);

// Contact update
router.patch(
  "/contact",
  riderAuth,
  generalRateLimiter,
  validate({ body: contactSchema }),
  onboardingController.updateContact
);

// Step 1: Ride Type
router.put(
  "/ride-type",
  riderAuth,
  generalRateLimiter,
  validate({ body: rideTypeSchema }),
  onboardingController.putRideType
);

// Step 2: Preference
router.put(
  "/preference",
  riderAuth,
  generalRateLimiter,
  validate({ body: preferenceSchema }),
  onboardingController.putPreference
);

// Step 3: Work Area
router.put(
  "/work-area",
  riderAuth,
  generalRateLimiter,
  validate({ body: workAreaSchema }),
  onboardingController.putWorkArea
);

// Step 4: Vehicle Details
router.put(
  "/vehicle",
  riderAuth,
  generalRateLimiter,
  validate({ body: vehicleSchema }),
  onboardingController.putVehicle
);

// Step 5: Identity - Aadhaar
router.post(
  "/identity/aadhaar/send-otp",
  riderAuth,
  generalRateLimiter,
  idempotencyMiddleware(),
  validate({ body: aadhaarSendOtpSchema }),
  onboardingController.postAadhaarSendOtp
);

router.post(
  "/identity/aadhaar/verify-otp",
  riderAuth,
  generalRateLimiter,
  validate({ body: aadhaarVerifyOtpSchema }),
  onboardingController.postAadhaarVerifyOtp
);

// Step 5: Identity - PAN
router.put(
  "/identity/pan",
  riderAuth,
  generalRateLimiter,
  validate({ body: panIdentitySchema }),
  onboardingController.putPanIdentity
);

// Step 6: Selfie
router.post(
  "/selfie",
  riderAuth,
  generalRateLimiter,
  validate({ body: selfieSchema }),
  onboardingController.postSelfie
);

// Step 7: Kit & Nominee
router.put(
  "/kit-nominee",
  riderAuth,
  generalRateLimiter,
  validate({ body: kitNomineeSchema }),
  onboardingController.putKitNominee
);

// Step 8: Bank & UPI
router.post(
  "/upi/verify",
  riderAuth,
  generalRateLimiter,
  idempotencyMiddleware(),
  validate({ body: upiVerifySchema }),
  onboardingController.postUpiVerify
);

router.put(
  "/bank",
  riderAuth,
  generalRateLimiter,
  validate({ body: bankSchema }),
  onboardingController.putBank
);

// Step 9: Submit
router.post(
  "/submit",
  riderAuth,
  generalRateLimiter,
  idempotencyMiddleware(),
  onboardingController.postSubmit
);

module.exports = router;
