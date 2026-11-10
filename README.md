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

Login uses `email` and `password`. Both endpoints return an access token; pass it to protected routes as `Authorization: Bearer <token>`. Public user-app registration cannot assign vendor or delivery-boy roles. Vendor signup is available only through the dedicated vendor API; delivery-boy accounts still require trusted provisioning. This starter does not include ordering, payments, dispatch, or service-specific workflows.

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
