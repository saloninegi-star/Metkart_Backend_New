const fs = require("fs");
const path = require("path");

const postmanCollection = {
  info: {
    _postman_id: "metkart-delivery-dedicated-collection-id",
    name: "Metkart Delivery App API",
    description:
      "Dedicated Rider / Delivery Boy App backend module. All routes are mounted under `/api/delivery` (and `/api/rider`). Standard baseUrl is http://localhost:3000.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [
    {
      name: "1. Rider App Auth & Contact",
      item: [
        {
          name: "Register Rider (/api/delivery/auth/register)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  password: "Password123",
                  role: "RIDER",
                  phone: "9876543210",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/register",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "register"],
            },
            description:
              "Dedicated Rider registration endpoint. Also accessible via `POST {{baseUrl}}/api/rider/auth/register`.",
          },
        },
        {
          name: "Verify Email OTP (/api/delivery/auth/otp/verify)",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  otp: "123456",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/otp/verify",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "otp", "verify"],
            },
            description:
              "Verifies 6-digit email OTP and issues rider access and refresh JWTs. Also accessible via `POST {{baseUrl}}/api/rider/auth/otp/verify`.",
          },
        },
        {
          name: "Resend Email OTP (/api/delivery/auth/otp/resend)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/otp/resend",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "otp", "resend"],
            },
            description:
              "Resends 6-digit email OTP (enforces 45s cooldown). Also accessible via `POST {{baseUrl}}/api/rider/auth/otp/resend`.",
          },
        },
        {
          name: "Login Rider (/api/delivery/auth/login)",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  password: "Password123",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/login",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "login"],
            },
            description:
              "Rider password login for verified email accounts. Also accessible via `POST {{baseUrl}}/api/rider/auth/login`.",
          },
        },
        {
          name: "Rotate Refresh Token (/api/delivery/auth/refresh)",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  refreshToken: "{{refreshToken}}",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/refresh",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "refresh"],
            },
            description:
              "Rotates rider refresh token and returns new access token. Also accessible via `POST {{baseUrl}}/api/rider/auth/refresh`.",
          },
        },
        {
          name: "Forgot Password - Send Reset OTP (/api/delivery/auth/forgot-password)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              options: { raw: { language: "json" } },
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/forgot-password",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "forgot-password"],
            },
            description:
              "Sends a 6-digit PASSWORD_RESET OTP if an active rider account exists (returns masked 200 otherwise, enforces 45s cooldown). Also accessible via `/api/rider/auth/forgot-password` and `/api/v1/auth/forgot-password`.",
          },
        },
        {
          name: "Resend Password Reset OTP (/api/delivery/auth/otp/resend)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              options: { raw: { language: "json" } },
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  flow: "FORGOT_PASSWORD",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/otp/resend",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "otp", "resend"],
            },
            description:
              "Resends a 6-digit PASSWORD_RESET OTP (45s cooldown, masked 200 on unknown/inactive emails). Also accessible via `/api/rider/auth/otp/resend` and `/api/v1/auth/otp/resend`.",
          },
        },
        {
          name: "Verify Password Reset OTP (/api/delivery/auth/otp/verify)",
          event: [
            {
              listen: "test",
              script: {
                type: "text/javascript",
                exec: [
                  "const json = pm.response.json();",
                  "if (pm.response.code === 200 && json?.data?.resetToken) {",
                  "  pm.environment.set('resetToken', json.data.resetToken);",
                  "  pm.collectionVariables.set('resetToken', json.data.resetToken);",
                  "}",
                ],
              },
            },
          ],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              options: { raw: { language: "json" } },
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  otp: "123456",
                  flow: "FORGOT_PASSWORD",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/otp/verify",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "otp", "verify"],
            },
            description:
              "Verifies PASSWORD_RESET OTP and returns a single-use resetToken (15 min TTL). Also accessible via `/api/rider/auth/otp/verify` and `/api/v1/auth/otp/verify`.",
          },
        },
        {
          name: "Reset Password (/api/delivery/auth/reset-password)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              options: { raw: { language: "json" } },
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  resetToken: "{{resetToken}}",
                  newPassword: "NewPassword@2026",
                  confirmPassword: "NewPassword@2026",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/auth/reset-password",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "auth", "reset-password"],
            },
            description:
              "Consumes single-use resetToken atomically, updates passwordHash, and revokes active refresh tokens. Also accessible via `/api/rider/auth/reset-password` and `/api/v1/auth/reset-password`.",
          },
        },
        {
          name: "Update Contact Phone (/api/delivery/onboarding/contact)",
          request: {
            method: "PATCH",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  phone: "9876543210",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/contact",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "contact"],
            },
            description:
              "Updates rider mobile contact number. Also accessible via `PATCH {{baseUrl}}/api/rider/onboarding/contact`.",
          },
        },
        {
          name: "Register Rider (Alias: /api/rider/auth/register)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  password: "Password123",
                  role: "RIDER",
                  phone: "9876543210",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/rider/auth/register",
              host: ["{{baseUrl}}"],
              path: ["api", "rider", "auth", "register"],
            },
            description: "Direct Rider alias endpoint matching Customer/Vendor naming.",
          },
        },
        {
          name: "Login Rider (Alias: /api/rider/auth/login)",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  email: "rider@example.com",
                  password: "Password123",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/rider/auth/login",
              host: ["{{baseUrl}}"],
              path: ["api", "rider", "auth", "login"],
            },
            description: "Direct Rider alias login endpoint.",
          },
        },
      ],
    },
    {
      name: "2. Delivery Onboarding Steps",
      item: [
        {
          name: "Get Onboarding Summary",
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{riderToken}}" }],
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding"],
            },
          },
        },
        {
          name: "Get Onboarding Status",
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{riderToken}}" }],
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/status",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "status"],
            },
          },
        },
        {
          name: "Step 1: Save Ride Type",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  rideType: "TWO_WHEELER",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/ride-type",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "ride-type"],
            },
          },
        },
        {
          name: "Step 2: Save Preference",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  deliveryPreference: "BOTH_DELIVERIES",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/preference",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "preference"],
            },
          },
        },
        {
          name: "List Operating Zones",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/delivery/zones?q=Hyderabad&limit=20",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "zones"],
              query: [
                { key: "q", value: "Hyderabad" },
                { key: "limit", value: "20" },
              ],
            },
          },
        },
        {
          name: "Step 3: Save Work Area",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  zoneId: "zone-medipally",
                  vehicleType: "MOTORCYCLE",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/work-area",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "work-area"],
            },
          },
        },
        {
          name: "Upload Document / Photo",
          request: {
            method: "POST",
            header: [
              { key: "Authorization", value: "Bearer {{riderToken}}" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "formdata",
              formdata: [
                { key: "purpose", value: "DL", type: "text" },
                { key: "file", type: "file", src: "" },
              ],
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/uploads",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "uploads"],
            },
          },
        },
        {
          name: "Delete Uploaded File",
          request: {
            method: "DELETE",
            header: [{ key: "Authorization", value: "Bearer {{riderToken}}" }],
            url: {
              raw: "{{baseUrl}}/api/delivery/uploads/{{fileId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "uploads", "{{fileId}}"],
            },
          },
        },
        {
          name: "Download Uploaded File (Signed URL)",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/delivery/uploads/download/:storageKey?expires=1700000000&signature=sig",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "uploads", "download", ":storageKey"],
              query: [
                { key: "expires", value: "1700000000" },
                { key: "signature", value: "sig" },
              ],
            },
          },
        },
        {
          name: "Step 4: Save Vehicle Details",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  vehicleNumber: "TS09EA1234",
                  brandModel: "Hero Splendor Plus",
                  fuelType: "PETROL",
                  dlNumber: "TS0920210001234",
                  dlExpiryDate: "2030-12-31",
                  documents: {
                    dlFileId: "{{fileId_DL}}",
                    rcFileId: "{{fileId_RC}}",
                  },
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/vehicle",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "vehicle"],
            },
          },
        },
        {
          name: "Step 5a: Aadhaar Send OTP",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  aadhaarNumber: "219837461230",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/identity/aadhaar/send-otp",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "identity", "aadhaar", "send-otp"],
            },
          },
        },
        {
          name: "Step 5b: Aadhaar Verify OTP",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  referenceId: "{{aadhaarRefId}}",
                  otp: "123456",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/identity/aadhaar/verify-otp",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "identity", "aadhaar", "verify-otp"],
            },
          },
        },
        {
          name: "Step 5c: Save PAN Identity",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  panNumber: "ABCDE1234F",
                  fullName: "Test Rider",
                  address: "Plot 12, Main Street, Hyderabad",
                  panFileId: "{{fileId_PAN}}",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/identity/pan",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "identity", "pan"],
            },
          },
        },
        {
          name: "Step 6: Submit Selfie",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  fileId: "{{fileId_SELFIE}}",
                  clientFaceDetected: true,
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/selfie",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "selfie"],
            },
          },
        },
        {
          name: "Step 7: Save Kit & Nominee",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  address: {
                    houseNo: "Flat 402, Green Meadows",
                    areaStreet: "Sector 4, Main Market Road, Medipally",
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
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/kit-nominee",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "kit-nominee"],
            },
          },
        },
        {
          name: "Lookup IFSC Code",
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{riderToken}}" }],
            url: {
              raw: "{{baseUrl}}/api/delivery/ifsc/SBIN0001234",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "ifsc", "SBIN0001234"],
            },
          },
        },
        {
          name: "Step 8a: Verify UPI ID",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  upiId: "rider@oksbi",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/upi/verify",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "upi", "verify"],
            },
          },
        },
        {
          name: "Step 8b: Save Bank Details",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{riderToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  accountNumber: "123456789012",
                  confirmAccountNumber: "123456789012",
                  ifscCode: "SBIN0001234",
                  accountType: "SAVINGS",
                  passbookFileId: "{{fileId_PASSBOOK}}",
                  upiVerificationId: "{{upiVerificationId}}",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/bank",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "bank"],
            },
          },
        },
        {
          name: "Step 9: Submit Onboarding Application",
          request: {
            method: "POST",
            header: [
              { key: "Authorization", value: "Bearer {{riderToken}}" },
              { key: "Idempotency-Key", value: "{{$guid}}" },
            ],
            url: {
              raw: "{{baseUrl}}/api/delivery/onboarding/submit",
              host: ["{{baseUrl}}"],
              path: ["api", "delivery", "onboarding", "submit"],
            },
          },
        },
      ],
    },
    {
      name: "3. Delivery Admin Review",
      item: [
        {
          name: "List Riders",
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
            url: {
              raw: "{{baseUrl}}/api/admin/delivery/riders?status=PENDING_REVIEW&page=1&limit=20",
              host: ["{{baseUrl}}"],
              path: ["api", "admin", "delivery", "riders"],
              query: [
                { key: "status", value: "PENDING_REVIEW" },
                { key: "page", value: "1" },
                { key: "limit", value: "20" },
              ],
            },
          },
        },
        {
          name: "Get Rider Details",
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
            url: {
              raw: "{{baseUrl}}/api/admin/delivery/riders/{{riderId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "admin", "delivery", "riders", "{{riderId}}"],
            },
          },
        },
        {
          name: "Approve Rider Application",
          request: {
            method: "PATCH",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{adminToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  decision: "APPROVE",
                  reason: "All documents verified and in order.",
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/admin/delivery/riders/{{riderId}}/review",
              host: ["{{baseUrl}}"],
              path: ["api", "admin", "delivery", "riders", "{{riderId}}", "review"],
            },
          },
        },
        {
          name: "Request Changes",
          request: {
            method: "PATCH",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{adminToken}}" },
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(
                {
                  decision: "REQUEST_CHANGES",
                  reason: "Vehicle RC photo is blurry. Please re-upload.",
                  stepsToRedo: ["VEHICLE"],
                },
                null,
                2
              ),
            },
            url: {
              raw: "{{baseUrl}}/api/admin/delivery/riders/{{riderId}}/review",
              host: ["{{baseUrl}}"],
              path: ["api", "admin", "delivery", "riders", "{{riderId}}", "review"],
            },
          },
        },
      ],
    },
    {
      name: "4. Monitoring & Health",
      item: [
        {
          name: "Process Health (healthz)",
          request: {
            method: "GET",
            url: {
              raw: "{{baseUrl}}/healthz",
              host: ["{{baseUrl}}"],
              path: ["healthz"],
            },
          },
        },
        {
          name: "Readiness Check (readyz)",
          request: {
            method: "GET",
            url: {
              raw: "{{baseUrl}}/readyz",
              host: ["{{baseUrl}}"],
              path: ["readyz"],
            },
          },
        },
        {
          name: "Application Metrics",
          request: {
            method: "GET",
            url: {
              raw: "{{baseUrl}}/metrics",
              host: ["{{baseUrl}}"],
              path: ["metrics"],
            },
          },
        },
      ],
    },
  ],
};

const postmanEnvironment = {
  id: "metkart-delivery-env-id",
  name: "Metkart Delivery Dedicated Environment",
  values: [
    { key: "baseUrl", value: "http://localhost:3000", enabled: true },
    { key: "deliveryBaseUrl", value: "http://localhost:3000/api/delivery", enabled: true },
    { key: "riderBaseUrl", value: "http://localhost:3000/api/rider", enabled: true },
    { key: "adminBaseUrl", value: "http://localhost:3000/api/admin/delivery", enabled: true },
    { key: "riderToken", value: "", enabled: true },
    { key: "refreshToken", value: "", enabled: true },
    { key: "resetToken", value: "", enabled: true },
    { key: "adminToken", value: "", enabled: true },
    { key: "riderId", value: "", enabled: true },
    { key: "fileId_DL", value: "", enabled: true },
    { key: "fileId_RC", value: "", enabled: true },
    { key: "fileId_PAN", value: "", enabled: true },
    { key: "fileId_SELFIE", value: "", enabled: true },
    { key: "fileId_PASSBOOK", value: "", enabled: true },
    { key: "upiVerificationId", value: "", enabled: true },
    { key: "aadhaarRefId", value: "", enabled: true },
  ],
};

function makePasswordResetRequest({ name, method = "POST", prefix, endpoint, body, withIdempotency = false, captureResetToken = false, description }) {
  const headers = [{ key: "Content-Type", value: "application/json" }];
  if (withIdempotency) {
    headers.push({ key: "Idempotency-Key", value: "{{$guid}}" });
  }
  const cleanPrefix = prefix.replace(/^\/+/, "");
  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  const item = {
    name,
    request: {
      method,
      header: headers,
      body: {
        mode: "raw",
        options: { raw: { language: "json" } },
        raw: JSON.stringify(body, null, 2),
      },
      url: {
        raw: `{{baseUrl}}/${cleanPrefix}/${cleanEndpoint}`,
        host: ["{{baseUrl}}"],
        path: [...cleanPrefix.split("/"), ...cleanEndpoint.split("/")],
      },
      description,
    },
  };

  if (captureResetToken) {
    item.event = [
      {
        listen: "test",
        script: {
          type: "text/javascript",
          exec: [
            "const json = pm.response.json();",
            "if (pm.response.code === 200 && json?.data?.resetToken) {",
            "  pm.collectionVariables.set('resetToken', json.data.resetToken);",
            "  pm.environment.set('resetToken', json.data.resetToken);",
            "}",
          ],
        },
      },
    ];
  }

  return item;
}

function buildPasswordResetFolder(folderName, prefix) {
  return {
    name: folderName,
    item: [
      makePasswordResetRequest({
        name: `1. Forgot Password (${prefix}/forgot-password)`,
        prefix,
        endpoint: "forgot-password",
        withIdempotency: true,
        body: { email: "{{riderEmail}}" },
        description:
          "Initiates password reset by creating a 6-digit PASSWORD_RESET OTP session (45s cooldown, masked 200 on unknown or inactive emails).",
      }),
      makePasswordResetRequest({
        name: `2. Resend Forgot Password OTP (${prefix}/otp/resend)`,
        prefix,
        endpoint: "otp/resend",
        withIdempotency: true,
        body: { email: "{{riderEmail}}", flow: "FORGOT_PASSWORD" },
        description: "Resends a fresh 6-digit PASSWORD_RESET OTP after the 45s cooldown.",
      }),
      makePasswordResetRequest({
        name: `3. Verify Forgot Password OTP (${prefix}/otp/verify)`,
        prefix,
        endpoint: "otp/verify",
        captureResetToken: true,
        body: { email: "{{riderEmail}}", otp: "123456", flow: "FORGOT_PASSWORD" },
        description:
          "Verifies the 6-digit PASSWORD_RESET OTP and stores the single-use resetToken in {{resetToken}}.",
      }),
      makePasswordResetRequest({
        name: `4. Reset Password (${prefix}/reset-password)`,
        prefix,
        endpoint: "reset-password",
        withIdempotency: true,
        body: {
          email: "{{riderEmail}}",
          resetToken: "{{resetToken}}",
          newPassword: "{{newPassword}}",
          confirmPassword: "{{newPassword}}",
        },
        description:
          "Atomically consumes resetToken, updates Rider password, sets emailVerifiedAt if previously unverified, and revokes active refresh tokens.",
      }),
      makePasswordResetRequest({
        name: `5. Login With New Password (${prefix}/login)`,
        prefix,
        endpoint: "login",
        body: {
          email: "{{riderEmail}}",
          password: "{{newPassword}}",
        },
        description: "Verifies login succeeds with the newly reset password.",
      }),
    ],
  };
}

const passwordResetCollection = {
  info: {
    _postman_id: "metkart-rider-password-reset-collection-id",
    name: "Metkart Rider Password Reset API",
    description:
      "Postman collection covering the Rider Password Reset flow across Dedicated Delivery (/api/delivery/auth/*), Dedicated Rider Alias (/api/rider/auth/*), and Shared Auth (/api/v1/auth/*).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000", type: "string" },
    { key: "riderEmail", value: "rider@example.com", type: "string" },
    { key: "resetToken", value: "", type: "string" },
    { key: "newPassword", value: "NewPassword@2026", type: "string" },
  ],
  item: [
    buildPasswordResetFolder("1. Dedicated Delivery Auth (/api/delivery/auth)", "/api/delivery/auth"),
    buildPasswordResetFolder("2. Dedicated Rider Alias (/api/rider/auth)", "/api/rider/auth"),
    buildPasswordResetFolder("3. Shared Auth Delegation (/api/v1/auth)", "/api/v1/auth"),
  ],
};

function generatePostmanFiles() {
  const collectionPath = path.resolve(
    process.cwd(),
    "docs",
    "Metkart_Rider_Onboarding.postman_collection.json"
  );
  const envPath = path.resolve(
    process.cwd(),
    "docs",
    "Metkart_Rider_Environment.postman_environment.json"
  );
  const passwordResetCollectionPath = path.resolve(
    process.cwd(),
    "docs",
    "Metkart_Rider_Password_Reset.postman_collection.json"
  );

  fs.mkdirSync(path.dirname(collectionPath), { recursive: true });
  fs.writeFileSync(collectionPath, JSON.stringify(postmanCollection, null, 2), "utf8");
  fs.writeFileSync(envPath, JSON.stringify(postmanEnvironment, null, 2), "utf8");
  fs.writeFileSync(
    passwordResetCollectionPath,
    JSON.stringify(passwordResetCollection, null, 2),
    "utf8"
  );
  console.log(`[Postman] Generated collection at ${collectionPath}`);
  console.log(`[Postman] Generated environment at ${envPath}`);
  console.log(`[Postman] Generated password reset collection at ${passwordResetCollectionPath}`);
}

if (require.main === module) {
  generatePostmanFiles();
}

module.exports = { generatePostmanFiles };
