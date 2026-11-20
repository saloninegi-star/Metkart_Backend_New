# Metkart Backend

A Node.js and Express modular-monolith API for the Metkart apps. It includes a shared user app with `food`, `recycle`, `mechanic`, and `grocery` roles, plus separate `vendor` and `delivery_boy` app access.

## Requirements

- Node.js 18 or newer
- MongoDB (local or hosted)

## Run locally

```powershell
npm install
Copy-Item .env.example .env
```

Set a long random `JWT_SECRET` in `.env`. To connect to your MongoDB, change only `MONGODB_URI`; the database name can be part of the URI.

```powershell
npm run dev
```

The API starts at `http://localhost:3000`. To run tests:

```powershell
npm test
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection URI, including the database name |
| `JWT_SECRET` | Yes | Random secret of at least 32 characters |
| `JWT_EXPIRES_IN` | No | JWT lifetime; defaults to `7d` |
| `PORT` | No | HTTP port; defaults to `3000` |
| `NODE_ENV` | No | Runtime mode |
| `CORS_ORIGIN` | No | Allowed browser origin; defaults to `*` |

## API

Core user API routes use the `/api/v1` prefix and JSON. Vendor auth and onboarding routes use `/api/vendor`; onboarding request formats are documented below.

| Method | Path | Access |
|---|---|---|
| `GET` | `/health` | Public |
| `POST` | `/api/v1/auth/register` | Public; only `food`, `recycle`, `mechanic`, or `grocery` |
| `POST` | `/api/v1/auth/login` | Public |
| `GET` | `/api/v1/accounts/me` | Any signed-in account |
| `GET` | `/api/v1/user-app/me` | `food`, `recycle`, `mechanic`, or `grocery` |
| `POST` | `/api/v1/vendor/register` | Public vendor signup |
| `POST` | `/api/v1/vendor/login` | Vendor account only |
| `GET` | `/api/v1/vendor/profile` | `vendor` |
| `PATCH` | `/api/v1/vendor/profile` | `vendor`; update name/business name/phone/address |
| `PATCH` | `/api/v1/vendor/change-password` | `vendor`; requires current and new password |
| `GET` | `/api/v1/vendor/me` | `vendor`; legacy profile endpoint |
| `GET` | `/api/v1/delivery/me` | `delivery_boy` |
| `POST` | `/api/user/orders` | Verified user; create an order with published product IDs |
| `GET` | `/api/user/orders/:userId` | Verified user; get all orders by user ID in URL params |
| `GET` | `/api/user/orders/vendor/:vendorId` | Public / Vendor; get all orders by vendor ID in URL params |
| `GET` | `/api/user/orders/all` | Admin; get all orders across the platform (supports pagination) |
| `GET` | `/api/admin/vendor/productcategory` | Admin; list all product categories |
| `POST` | `/api/admin/vendor/productcategory/:shopTypeId` | Admin; create category for a shop type with `productcategoryname` |
| `GET` | `/api/admin/vendor/productcategory/by-shoptype/:shopTypeId` | Admin; list categories for a shop type |
| `GET` | `/api/admin/vendor/productcategory/detail/:id` | Admin; get one category |
| `PUT` | `/api/admin/vendor/productcategory/detail/:id` | Admin; update `productcategoryname` and/or `isActive` |
| `DELETE` | `/api/admin/vendor/productcategory/detail/:id` | Admin; delete category |

Registration example:

```json
{
  "name": "Asha",
  "email": "asha@example.com",
  "password": "choose-a-strong-password",
  "role": "food"
}
```

Login uses `email` and `password`. Both endpoints return an access token; pass it to protected routes as `Authorization: Bearer <token>`. Public user-app registration cannot assign vendor or delivery-boy roles. Vendor signup is available only through the dedicated vendor API; delivery-boy accounts still require trusted provisioning. Order creation is available through the user orders API; payment, dispatch, and service-specific workflows are not included.

### User orders

Create an order with a verified user's token. The `userId` in the request must match the user ID in the token; all product IDs must refer to published products with stock available. New orders start with `pending` status.

```http
POST /api/user/orders
Authorization: Bearer <user-token>
Content-Type: application/json
```

```json
{
  "userId": "507f1f77bcf86cd799439011",
  "productIds": [
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ]
}
```

The creation response populates `userId` with the user's profile details and each `productIds` entry with its product details. Sensitive user fields such as OTP data are not included.

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "_id": "order-id",
    "userId": {
      "_id": "507f1f77bcf86cd799439011",
      "fullName": "Asha",
      "email": "asha@example.com",
      "mobileNumber": "+1-555-0100",
      "currentAddress": "Example address"
    },
    "productIds": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "title": "Product name",
        "category": "Grocery",
        "description": "Product description",
        "weightVolume": "1 kg",
        "price": 10,
        "images": []
      }
    ],
    "status": "pending"
  }
}
```

Vendor registration is provided separately from user-app registration:

```json
{
  "name": "Asha",
  "email": "vendor@example.com",
  "password": "choose-a-strong-password",
  "businessName": "Asha Foods",
  "phone": "+1-555-0100"
}
```

Vendor profile updates accept `name`, `businessName`, `phone`, and an `address` object with `street`, `city`, `state`, `postalCode`, and `country`. Change password with `{ "currentPassword": "...", "newPassword": "..." }`; existing access tokens are invalidated, so sign in again afterwards.

### Vendor onboarding

After email OTP verification, use the returned vendor token as `Authorization: Bearer <token>`:

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/vendor/onboarding/:type` | Save or update a draft |
| `POST` | `/api/vendor/onboarding/:type/submit` | Validate required fields and submit for review |
| `GET` | `/api/vendor/onboarding/:type` | Get saved form, status, and private file URLs |
| `GET` | `/api/vendor/onboarding/:type/files/:filename` | View a file belonging to the signed-in vendor |

`:type` must be `shopkeeper`, `restaurant`, `mechanic`, or `scrapVendor`. Send each value as an individual key in `multipart/form-data` (not inside a `data` JSON field). Include `vendorId`; it must match the authenticated vendor token. The IDs `businessTypeId`, `shopTypeId`, and `categoryId` are also submitted individually and are required when submitting the completed profile. Shared profile fields are `ownerFullName`, `email`, `mobileNumber`, `whatsappUpdates`, `primaryContactSameAsOwner`, `primaryContactNumber`, `shopNo`, `floor`, `area`, `city`, `nearbyLandmark`, `latitude`, `longitude`, `panNumber`, `panFullName`, `gstRegistered`, `gstNumber`, `gstFullName`, `registeredBusinessAddress`, `tradeLicenseNumber`, `bankAccountNumber`, `bankAccountNumberConfirm`, `ifscCode`, and `accountType`. Send booleans as `true` or `false`, coordinates/experience as numeric strings, and array fields as JSON strings (for example `["Cafe","Bakery"]`). For backwards compatibility, the server also accepts a JSON `data` field.

Role-specific JSON fields:

| Type | Additional fields |
|---|---|
| `shopkeeper` | `shopkeeperName` |
| `restaurant` | `restaurantName`, `cuisineTypes` (string array), `fssaiNumber` |
| `mechanic` | `garageName`, `serviceCategories` (string array), `yearsExperience` |
| `scrapVendor` | `businessName`, `scrapCategories` (string array), `pickupAvailable` |

All types use the same file fields: `panCard`, `aadhaarCard`, `storefrontPhotos` (up to 10), `gstCertificate`, `tradeLicense`, and `bankProof`. Each file is limited to 5 MB; PDF, JPEG, PNG, and WEBP are accepted. Files are stored outside the public `/uploads` directory and can only be retrieved by their owner. Drafts may be partial; submission checks required profile, tax, bank, and document fields. Bank-account confirmation is checked but never stored.

Example multipart text fields for a shopkeeper draft: `vendorId`, `businessTypeId`, `shopTypeId`, `categoryId`, `shopkeeperName`, `ownerFullName`, `email`, `mobileNumber`, `area`, and `city`. Add the remaining shared and role-specific keys as shown above; attach documents using the shared file field names.

## Structure

```text
src/
  app.js
  server.js
  config/               # Environment and MongoDB connection
  middleware/           # Authentication, authorization, errors
  modules/
    accounts/           # Account model and profile endpoint
    auth/               # Registration and login
    health/             # Liveness endpoint
  utils/
test/
```

The server connects to MongoDB before accepting HTTP traffic and closes the database connection on shutdown. Do not commit `.env` or production secrets.


## Delivery Boy / Rider Onboarding API

The Delivery / Rider module provides an isolated, production-grade 8-step onboarding flow for delivery partners supporting both two-wheeler and heavy vehicles.

### Architecture (Three Separate Apps)
- **Customer App:** `/api/user/*`
- **Vendor App:** `/api/vendor/*`
- **Delivery / Rider App:** `/api/delivery/*` (and `/api/rider/*`, aliased to `/api/v1/*` per v1.1 requirements specification)

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PROVIDER_MODE` | `mock` | `mock` runs full flow locally without external credentials. `real` plugs into third-party providers. |
| `PASSWORD_MIN_LENGTH` | `6` | Minimum password length for rider signup. |
| `OTP_EXPIRY_SECONDS` | `600` | 10 minutes OTP validity. |
| `OTP_RESEND_SECONDS` | `45` | 45-second cooldown between OTP resends. |
| `OTP_MAX_ATTEMPTS` | `5` | Maximum wrong OTP attempts before lockout. |
| `UPLOAD_MAX_BYTES` | `5242880` | 5 MB maximum upload file size. |
| `JWT_ACCESS_TTL` | `15m` | 15-minute access token lifespan. |
| `REFRESH_TTL_DAYS` | `30` | 30-day rotating refresh token lifetime. |
| `DATA_ENCRYPTION_KEY` | - | 32+ char key for AES-256-GCM encryption of PAN and Bank account at rest. |
| `DATA_ENCRYPTION_KEY_ID` | `k1` | Key identifier stored beside ciphertext for seamless key rotation. |
| `AADHAAR_HMAC_KEY` | - | 32+ char secret for Aadhaar duplicate detection HMAC. |
| `MEDICAL_COVER_INR` | `100000` | Medical insurance cover provided upon admin approval (1 Lakh INR). |
| `ACCIDENTAL_COVER_INR` | `1000000` | Accidental life insurance cover provided upon admin approval (10 Lakh INR). |
| `SELFIE_MAX_ATTEMPTS_PER_DAY` | `5` | Daily limit on face match/liveness attempts. |

### Endpoints Overview

#### 1. Authentication (`/api/delivery/auth` or `/api/v1/auth`)
- `POST /register`: Register with `{ email, password, role: "RIDER", phone? }`. In mock mode, sends OTP.
- `POST /otp/verify`: Verify email with `{ email, otp }`. In mock mode, valid OTP is `123456`. Returns JWT tokens and current onboarding step.
- `POST /otp/resend`: Resend verification code (45s cooldown).
- `POST /login`: Authenticate rider with `{ email, password }`.
- `POST /refresh`: Rotate refresh token family.

#### 2. Onboarding Steps (`/api/delivery/onboarding` or `/api/v1/rider/onboarding`)
- `GET /`: Get complete onboarding summary (masked sensitive data, `currentStep`, `canSubmit`).
- `GET /status`: Lightweight status summary (`status`, `referenceNumber`, `stepsToRedo`).
- `PATCH /contact`: Set/update rider contact phone (`^[6-9][0-9]{9}$`).
- `PUT /ride-type`: Step 1 — Select `TWO_WHEELER` or `HEAVY_VEHICLE`.
- `PUT /preference`: Step 2 — Delivery preference (`FOOD_DELIVERY`, `GROCERY_DELIVERY`, `BOTH_DELIVERIES`, `HEAVY_DELIVERY`, `SCRAP_PICKER`).
- `GET /zones`: Helper — List active zones with demand level and coordinates.
- `PUT /work-area`: Step 3 — Select operating `zoneId`, `vehicleType`, and `vehicleOwnership` (if heavy).
- `POST /uploads`: Helper — Multipart document/photo upload with MIME sniffing (JPEG, PNG, WEBP, PDF).
- `DELETE /uploads/:fileId`: Helper — Delete unreferenced private upload.
- `PUT /vehicle`: Step 4 — Vehicle registration, DL, and document file IDs.
- `POST /identity/aadhaar/send-otp`: Step 5a — 12-digit Aadhaar with Verhoeff checksum.
- `POST /identity/aadhaar/verify-otp`: Step 5b — 6-digit Aadhaar OTP (mock: `123456`).
- `PUT /identity/pan`: Step 5c — Alternative PAN document and address verification.
- `POST /selfie`: Step 6 — Selfie image with liveness and face match score.
- `PUT /kit-nominee`: Step 7 — Kit shipping address (36 Indian States/UTs) and insurance nominee.
- `GET /ifsc/:code`: Helper — Lookup bank name and branch from IFSC.
- `POST /upi/verify`: Helper — Verify UPI ID (valid for 30 minutes).
- `PUT /bank`: Step 8 — Bank account number, IFSC, penny drop verification, name match.
- `POST /submit`: Step 9 — Submit completed application for admin review (generates reference `RDR-<year>-<seq>`).

#### 3. Admin Review API (`/api/v1/admin/riders` or `/api/admin/delivery/riders`)
- `GET /`: Paginated rider list with status and anchored search filters.
- `GET /:riderId`: Complete rider profile with 10-minute temporary signed file URLs.
- `PATCH /:riderId/review`: Make review decision (`APPROVE`, `REJECT`, `REQUEST_CHANGES`). Approving creates `kit_orders` and `insurance_enrollments`.

#### 4. Monitoring & Observability
- `GET /healthz`: Process liveness.
- `GET /readyz`: MongoDB replica ping check.
- `GET /metrics`: Request count, status codes, and latency tracking.
