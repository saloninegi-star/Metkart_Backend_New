# Rider Application — Backend Audit & Redrafted Implementation Plan

> **Audit Date:** 2026-11-26  
> **Codebase HEAD:** `0ee9c6b` (`Implemented password reset flow in rider module`)  
> **Frontend Reference:** Attached Google AI Studio export `src.zip` (`93` files — verified byte-for-byte identical to the prototype analyzed in [`RIDER_APPLICATION_SYSTEM_DESIGN_AND_BACKEND_REQUIREMENTS.md`](RIDER_APPLICATION_SYSTEM_DESIGN_AND_BACKEND_REQUIREMENTS.md))  
> **Scope Rule:** Preserve all working Auth, Password Reset, Onboarding, Uploads, Zones, IFSC, and Admin Review modules without breaking existing contracts. All upcoming phases are strictly additive.

---

## 1. Current Codebase Implementation Audit

### 1.1 Verification Summary

* **Express App & Environment:** `package.json` dependency formatting and `qrcode` installation are fixed; `createApp()` loads cleanly.
* **Module Mountings (`src/app.js` & `src/modules/delivery/index.js`):**
  * Dedicated Rider/Delivery router mounted on both `/api/delivery/*` and `/api/rider/*`.
  * Direct v1 spec mounts on `/api/v1/rider/onboarding`, `/api/v1/zones`, `/api/v1/uploads`, `/api/v1/ifsc`, `/api/v1/admin`, and `/api/admin/delivery`.
  * Shared auth delegation mounted on `/api/v1/auth/*` (`src/modules/auth/auth.routes.js`).
  * Monitoring endpoints (`/health`, `/healthz`, `/readyz`, `/metrics`) and startup zone seeding (`seedZones()` in `src/server.js`) are active.
* **Automated Baseline (`node --test test/mailer.test.js test/rider-onboarding.test.js test/rider-password-reset.test.js`):** **27 passed, 0 failed, 0 skipped** (unit, schema validation, crypto/Verhoeff/MIME helpers, mocked mailer fallback, and in-process Express password-reset routing).

---

### 1.2 Detailed Status vs. `src.zip` Blueprint

| Blueprint Area (`src.zip`) | Status | Existing Implementation (Keep Untouched) | Remaining Gaps vs. Prototype |
| :--- | :--- | :--- | :--- |
| **Auth — Registration, Login, Tokens & Email OTP** | **Implemented** | `POST /register`, `POST /otp/verify`, `POST /otp/resend`, `POST /login`, `POST /refresh` across `/api/delivery/auth/*`, `/api/rider/auth/*`, `/api/v1/auth/*` (`auth.routes.js`, `auth.service.js`), `PATCH /onboarding/contact`, plus Nodemailer SMTP primary + Brevo HTTPS API fallback (`src/utils/mailer.js`, `adapters/index.js`). | • `POST /logout` (revoke refresh token + force rider offline)<br>• `POST /social` (Google/Apple OAuth, if retained in Flutter production)<br>• Legacy `/api/v1/delivery/me` still uses separate `Account` model (`delivery_boy`) instead of `RiderUser` (`RIDER`). |
| **Auth — Password Recovery (`S04`–`S07`)** | **Implemented (`0ee9c6b`)** | `POST /forgot-password`, flow-aware `POST /otp/verify` (`flow: "FORGOT_PASSWORD"` issuing single-use SHA-256 `PasswordResetToken`), flow-aware `POST /otp/resend`, `POST /reset-password` (atomic token burn + bcrypt update + `RefreshToken` family revocation), audit events, `PASSWORD_RESET` email template, and Postman collections. | Fully implemented (`S04`–`S07`). |
| **Rider Profile Screen (`S23` / Avatar & Profile Tab)** | **Not Implemented** | None in `src/modules/delivery/`. | Confirmed **Rider-specific** `GET /profile` & `PATCH /profile` (identity/KYC/vehicle/zone/insurance/bank summary, avatar, editable rider contact/address, app settings); excludes customer `Wishlist` / `Gift Cards` / `Address Book`. |
| **Delivery Boy Onboarding (`S08`–`S15`)** | **~95% Implemented** | Complete 8-step state machine (`RIDE_TYPE`, `PREFERENCE`, `WORK_AREA`, `VEHICLE` across Motorcycle / EV / Cycle / 4 Heavy classes, Aadhaar OTP + PAN fallback, `SELFIE`, `KIT_NOMINEE`, `UPI` + `BANK` + `IFSC`, `POST /submit` -> `PENDING_REVIEW` `RDR-YYYY-XXXXXX`), `GET /onboarding`, `GET /onboarding/status`, and Admin Review (`GET /admin/riders`, `GET /admin/riders/:riderId`, `PATCH /admin/riders/:riderId/review`). | • Optional standalone endpoints: `POST /onboarding/identity/aadhaar/reset` (`Wrong Aadhaar?`) and `PUT /onboarding/identity/aadhaar/document`.<br>• `KycProvider`, `FaceMatchProvider`, and `BankProvider` (`adapters/index.js`) currently run mock/static implementations (`"123456"`, `"Test Rider"`, 4 IFSC entries). |
| **Geo-Zones & Demand Map (`S10`, `S21`)** | **Onboarding Done; Map Missing** | `Zone` collection (`2dsphere`), auto-seeded 6 Hyderabad zones (`seedZones.js`), `GET /zones` (`q`, `lat`, `lng`, `limit`). | Live operational heatmap (`GET /demand-map`), dynamic updates to `activeOrders` / `demandLevel`, and `courier_zones`. |
| **Document & Media Storage (`S11`–`S15`)** | **Implemented (Local Disk)** | `POST /uploads` (`5 MB`, magic-byte sniffing, 13 purposes, idempotency), `DELETE /uploads/:fileId`, HMAC-signed `GET /uploads/download/:storageKey`. | Uses ephemeral local disk (`.data/uploads`); production cloud object storage adapter (`S3` / `R2` / `GCS`) is needed before multi-instance / Render persistence. Add `AVATAR` purpose if profile avatar upload is separated. |
| **Courier Branch (`S16`–`S20`)** | **Intentionally Blocked** | Schema `workArea` / `validation` references `"COURIER"` enum value. | Rejected by `RiderProfile.rideType` enum and `saveRideType()` (`422 COURIER_NOT_SUPPORTED`). Post-work-area screens (GSTIN, warehouse area, serviceable pincodes, bank) are absent in `src.zip`. |
| **Operational Dashboard & Duty Loop (`S21`)** | **Not Implemented** | None in `src/modules/delivery/`. (`socket.io` / `ws` are not installed in `package.json`). | `GET /dashboard`, `PATCH /duty-status` (`ONLINE`/`OFFLINE`), `POST /location`, offer feed (`15s` TTL, `/offers/current`, `/offers/:orderId/accept`, `/reject`), 3-phase trip APIs (`/arrive-merchant`, `/pickup`, `/complete`), `/api/pickups` scrap bridge. |
| **Earnings, Prestige, Payouts & Notifications (`S21`, `S22`)** | **Not Implemented** | None (`admin.service.js` only logs review events to console; `/api/wallet/withdraw` and `/api/pickups` do not exist anywhere in `src/`). | `rider_transactions`, `payout_requests`, daily target bonus (`₹800` / 5 rides / `₹150`), Prestige tiers (`GOLD STAR RIDER` -> `PLATINUM`), `POST /payouts/instant` (`/api/wallet/withdraw`), `GET/PATCH/DELETE /notifications`. |
| **Offline TOTP & Sync Queue (`S21`, `S24`)** | **Not Implemented** | None. | Per-order `offlineTotpSecret` provisioning, server-side 10-min 4-digit TOTP verification, and idempotent `POST /offline/sync`. |
| **Database Schemas (`models/index.js`)** | **20 Models Exist** | `RiderUser`, `OtpSession`, `RefreshToken`, `PasswordResetToken`, `RiderProfile`, `Zone`, `Vehicle`, `FileRecord`, `RiderDocument`, `KycRecord`, `SelfieCheck`, `KitAddress`, `InsuranceNominee`, `BankAccount`, `UpiVerification`, `KitOrder`, `InsuranceEnrollment`, `IdempotencyKey`, `Counter`, `AuditLog`. | Missing: `rider_runtime_states`, `delivery_assignments`, `rider_transactions`, `payout_requests`, `rider_notifications`, `offline_sync_logs` (plus `courier_zones` & `courier_applications` if Courier launches). |

### 1.3 Cross-Module Readiness Audit (Outside `src/modules/delivery/`)

* **`src/modules/user/orders/order.model.js`:** Schema currently contains only `{ userId, productIds, status: ["pending", "confirmed", "cancelled"] }`. It has no pickup/drop GeoJSON coordinates, merchant ready status, `handoverOtp`, or `assignedRiderId`.
* **`src/modules/vendor/dashboard/dashboard.controller.js`:** Returns static zero counters (`todaysOrders: { count: 0 }`) with no order packing / merchant handover OTP workflow implemented yet.

---

## 2. Confirmed Decisions & Open Questions Before Writing New Code

### Confirmed
* **Rider-Specific Profile (`S23` & Task Bar `Profile` Tab):** `GET/PATCH /profile` must serve **Rider-specific data only** (personal details, selfie avatar, onboarding/verification status, work-area zone & preference, vehicle summary, insurance nominee & kit status, masked bank/UPI settlement info, and notification/language/accessibility preferences) — excluding customer-only `ProfileHub` features (`Wishlist`, `Gift Cards`, `Address Book`, customer tier copy).

### Still Requiring Confirmation
1. **Approval Gate for Operational Endpoints (`RiderProfile.status === "APPROVED"`):** Confirm whether operational APIs (`/duty-status`, `/offers`, `/orders`, `/payouts`) must block riders until Admin sets `APPROVED` (recommended to preserve onboarding integrity vs. `App.tsx` prototype shortcut).
2. **Real-Time Offer & GPS Transport:** Choose **WebSockets (`socket.io` — requires adding package)**, **Server-Sent Events (SSE)**, or **HTTP short-polling** for `15s` incoming offers and live customer tracking.
3. **Order / Scrap Bridge (`UserOrder` & `/api/pickups`):** Confirm how `DeliveryAssignment` links to `UserOrder` (`src/modules/user/orders/`) and whether heavy riders with `SCRAP_PICKER` / `BOTH_DELIVERIES` pull jobs via unified `GET /api/pickups` + `PUT /api/pickups/:id`.
4. **Wallet Ledger Separation & Withdrawal Endpoint:** Confirm maintaining a single authoritative `walletBalance` (avoiding the prototype's `todayEarnings + balance` double-count display bug) and settling directly to the saved onboarding `BankAccount` / verified UPI via `POST /api/rider/payouts/instant` (with optional `/api/wallet/withdraw` alias).
5. **Courier Service Post-Work-Area Requirements:** Confirm whether `"COURIER"` remains disabled (`422 COURIER_NOT_SUPPORTED`) until courier document/bank/dashboard requirements are specified.
6. **External Providers & Cloud Storage:** Confirm when to enable cloud storage (S3/R2/GCS) for uploads and live UIDAI/PAN/FaceMatch/IFSC/UPI/Payout adapters under `PROVIDER_MODE=real`.

---

## 3. Redrafted Implementation Plan (Remaining Phases 1–6)

> **Non-Regression Architecture Guardrails:**
> 1. Keep `src/modules/delivery/onboarding/*`, `uploads/*`, `zones/*`, `ifsc/*`, `admin/*`, and existing `auth/*` routes intact.
> 2. Store mutable operational state (`isOnline`, coordinates, wallet balance, daily stats, prestige metrics) in a dedicated **`RiderRuntimeState`** (`rider_runtime_states`) collection rather than adding high-churn operational fields to `RiderProfile`.
> 3. Enforce operational access via a composed **`approvedRiderAuth`** middleware (`riderAuth` + `RiderProfile.status === "APPROVED"`).
> 4. Wrap all new routes with existing `requestIdMiddleware`, `noSqlSanitizer`, `validate`, `idempotencyMiddleware`, `generalRateLimiter`, and `deliveryErrorHandler` inside `src/modules/delivery/index.js`.

---

### Phase 1 — Auth Session Completion & Rider-Specific Profile

* **Target Files:**
  * Extend `src/modules/delivery/auth/` (`auth.routes.js`, `auth.controller.js`, `auth.service.js`, `auth.validation.js`) and `src/modules/auth/auth.routes.js`.
  * Create `src/modules/delivery/profile/` (`profile.routes.js`, `profile.controller.js`, `profile.service.js`, `profile.validation.js`).
  * Extend `src/modules/delivery/uploads/uploads.service.js` & `models/index.js` (`purpose: "AVATAR"` if separate avatar uploads are allowed alongside `SELFIE`).
* **Endpoints:**
  * `POST /api/delivery/auth/logout` *(+ `/api/rider/auth/logout`, `/api/v1/auth/logout`)*: Revokes supplied refresh token family (`RefreshToken.revokedAt`) and sets `RiderRuntimeState.isOnline = false` if present; protected by `riderAuth`.
  * `GET /api/delivery/profile` *(+ `/api/rider/profile`)*: Protected by `riderAuth`; returns the complete **Rider-specific profile** hydrated from existing collections (`RiderUser`, `RiderProfile`, `Zone`, `Vehicle`, `KycRecord`, signed `SelfieCheck` / avatar URL, `KitAddress`, `KitOrder`, `InsuranceNominee`, `InsuranceEnrollment`, masked `BankAccount` + UPI, plus `appPreferences`), omitting customer-only concepts (`Wishlist`, `Gift Cards`, `Address Book`).
  * `PATCH /api/delivery/profile` *(+ `/api/rider/profile`)*: Protected by `riderAuth`; allows updating mutable rider profile fields (`phone` with uniqueness check, `avatarFileId` validated via `FileRecord`, residential/current `address` or `kitAddress`, and `appPreferences` such as `pushNotificationsEnabled`, `language`, accessibility toggles; KYC-locked fields like Aadhaar/PAN name, verified vehicle docs, and bank settlement details remain read-only once submitted/approved and require re-onboarding/admin review), emitting `PROFILE_UPDATED` audit log.
  * *(Optional, if social login stays in Flutter)* `POST /api/delivery/auth/social`: Verifies Google/Apple ID tokens and routes incomplete riders to onboarding `currentStep`.
  * *(Optional onboarding ergonomics)* `POST /api/delivery/onboarding/identity/aadhaar/reset` & `PUT /api/delivery/onboarding/identity/aadhaar/document`.
* **Verification:** Unit & in-process route tests (`test/rider-auth-profile.test.js`) verifying logout token revocation, Rider-specific profile aggregation (masked PII/bank data + signed avatar URL), phone conflict handling (`409 PHONE_ALREADY_USED`), and KYC/onboarding lock enforcement.

---

### Phase 2 — Operational Runtime State, Dashboard Hydration & Duty/Location Feeds

* **New Collection (`src/modules/delivery/models/index.js`):**
  * **`RiderRuntimeState` (`rider_runtime_states`):**
    * `riderId` (ObjectId unique FK -> `RiderUser`), `isOnline` (Boolean, default `false`), `statusText` (`"OFFLINE" | "WAITING_FOR_OFFERS" | "ON_TRIP"`).
    * `currentLocation` (GeoJSON `{ type: "Point", coordinates: [lng, lat] }` with `2dsphere` index), `lastLocationAt`.
    * `walletBalance` (Number, default `0`), `todayEarnings` (Number, default `0`), `todayTripsCount` (Number, default `0`), `todayPoints` (Number, default `0`), `lastStatsDate` (`YYYY-MM-DD` IST string for atomic day-rollover), `dailyBonusClaimedDate` (`String | null`).
    * `totalTripsCompleted` (Number), `ecoPoints` (Number), `carbonOffsetKg` (Number), `offeredCount` (Number), `acceptedCount` (Number), `ratingSum` (Number), `ratingCount` (Number), `prestigeTier` (`"GOLD_STAR_RIDER" | "PLATINUM"`).
* **Middleware (`src/modules/delivery/middleware/approvedRiderAuth.middleware.js`):**
  * Runs `riderAuth`, loads `RiderProfile` (`status`), and rejects non-approved riders with `403 ONBOARDING_NOT_APPROVED`.
* **Integration Hook (`src/modules/delivery/admin/admin.service.js`):**
  * Inside `reviewRider()` when `decision === "APPROVE"`, upsert `RiderRuntimeState` (`riderId`) within the approval transaction.
* **New Sub-Module (`src/modules/delivery/dashboard/`):**
  * `GET /dashboard` (`approvedRiderAuth`): Performs lazy IST day rollover (`lastStatsDate`), hydrates shift status, daily target progress (`₹800` / `5` rides / `₹150` bonus), prestige metrics (`acceptanceRate`, `rating`, `totalTripsCompleted`, `platinumThresholdTrips: 25`), `walletBalance`, masked `BankAccount`, and any open `DeliveryAssignment`.
  * `PATCH /duty-status` (`approvedRiderAuth`): Toggles `{ isOnline, lat?, lng? }`; rejects going offline if rider has an in-progress active assignment (`409 ACTIVE_TRIP_IN_PROGRESS`).
  * `GET /demand-map` (`approvedRiderAuth`): Aggregates active zones (`Zone`), active order density, `peakHoursActive`, `expectedNextBookingMinutes`, and nearby hotspots.
  * `POST /location` (`approvedRiderAuth`): Updates `currentLocation` and broadcasts live ETA/coordinates to active customer order subscribers when `activeOrderId` is provided.
* **Verification:** `test/rider-dashboard.test.js` covering `ONBOARDING_NOT_APPROVED` blocking, day-rollover reset of `todayEarnings`, and duty toggle guards.

---

### Phase 3 — Offer Dispatch, 3-Phase Trip Execution & Cross-Module Order Bridges

* **New Collection (`src/modules/delivery/models/index.js`):**
  * **`DeliveryAssignment` (`delivery_assignments`):**
    * `orderCode` (unique String, e.g. `MK-FOOD-9104`), `sourceType` (`"USER_ORDER" | "SCRAP_PICKUP" | "MANUAL"`), `sourceOrderId` (ObjectId, nullable), `orderType` (`"food" | "grocery" | "scrap"`).
    * `riderId` (ObjectId FK -> `RiderUser`), `zoneId` (String FK -> `Zone`).
    * Snapshots: `merchant` (`vendorId`, `name`, `address`, `coords`), `customer` (`userId`, `name`, `phone`, `address`, `coords`), `itemsSummary`, `carrierRequirement`.
    * Compensation: `basePay`, `tip`, `greenBonus`, `estEarnings`, `ecoPoints`, `carbonOffsetKg`, `distanceText`, `estTimeText`.
    * State machine: `status` enum `["OFFERED", "PASSED", "EXPIRED", "ROUTING_TO_STORE", "AT_STORE", "ROUTING_TO_CUSTOMER", "COMPLETED", "CANCELLED"]`.
    * Handshake & Offline fields: `handoverOtp` (4-digit string generated on merchant readiness/arrival), `offlineTotpSecretEnc` (AES-256-GCM per-order secret), `completionMode` (`"ONLINE" | "OFFLINE_TOTP"`), `offeredAt`, `expiresAt` (`+15s`), `acceptedAt`, `arrivedMerchantAt`, `pickedUpAt`, `completedAt`.
    * Indexes: `{ riderId: 1, status: 1 }`, `{ status: 1, expiresAt: 1 }`, `{ sourceType: 1, sourceOrderId: 1 }`.
* **New Sub-Module (`src/modules/delivery/dispatch/`):**
  * `GET /offers/current`: Returns active non-expired `"OFFERED"` assignment (and expires stale timed-out offers lazily).
  * `POST /offers/:orderId/accept`: **Atomic `findOneAndUpdate`** requiring `{ _id, riderId, status: "OFFERED", expiresAt: { $gt: now } }` -> transitions to `"ROUTING_TO_STORE"`, increments `offeredCount`/`acceptedCount`, and generates per-order `offlineTotpSecretEnc`. Returns `409 OFFER_EXPIRED` if missed.
  * `POST /offers/:orderId/reject`: Transitions `"OFFERED"` -> `"PASSED"`, increments `offeredCount`, updates `acceptanceRate`, and triggers fallback dispatch.
  * `POST /orders/:orderId/arrive-merchant`: Transitions `"ROUTING_TO_STORE"` -> `"AT_STORE"`, ensures `handoverOtp` is visible to Vendor portal.
  * `POST /orders/:orderId/pickup`: Validates optional `handoverOtp` (if enforced), transitions `"AT_STORE"` -> `"ROUTING_TO_CUSTOMER"`.
  * `POST /orders/:orderId/complete`: Executes inside a MongoDB transaction -> marks `"COMPLETED"`, credits `RiderRuntimeState.walletBalance`, `todayEarnings`, `todayTripsCount`, `totalTripsCompleted`, `ecoPoints`, `carbonOffsetKg`, unlocks `₹150` Daily Target Bonus upon hitting threshold, upgrades `prestigeTier` to `"PLATINUM"` at `25` trips, creates `RiderTransaction` rows, and updates source order status.
* **Cross-Module Extensions (`src/modules/user/orders/` & `src/modules/vendor/`):**
  * Extend `UserOrder` (`order.model.js`) with optional backward-compatible fulfillment fields (`assignedRiderId`, `handoverOtp`, `fulfillmentStatus`, pickup/drop coordinates).
  * Add Vendor ready-for-pickup / handover OTP view endpoints and Customer live-tracking / post-delivery rider rating endpoints (updating `RiderRuntimeState.ratingSum` / `ratingCount`), plus `GET /api/pickups` & `PUT /api/pickups/:id` if heavy scrap riders use unified pickup dispatch.
* **Verification:** `test/rider-dispatch.test.js` testing atomic offer race conditions, 15s expiration, valid/invalid state transitions, handover OTP checks, daily bonus unlock, and `PLATINUM` threshold promotion.

---

### Phase 4 — Earnings Ledger, Order History & Instant Payouts

* **New Collections (`src/modules/delivery/models/index.js`):**
  * **`RiderTransaction` (`rider_transactions`):** `riderId`, `assignmentId` (nullable), `payoutRequestId` (nullable), `type` (`"delivery_earning" | "daily_bonus" | "payout" | "eco"`), `title`, `description`, `amount` (signed Number), `balanceAfter`, `ecoPointsDelta`.
  * **`PayoutRequest` (`payout_requests`):** `riderId`, `referenceId` (`TXN-...` unique), `amount` (> 10), `method` (`"bank" | "upi"`), `destinationMasked`, `bankAccountId`, `status` (`"PROCESSING" | "SUCCESS" | "FAILED"`), `utrNumber`, `failureReason`.
* **New Sub-Module (`src/modules/delivery/wallet/`):**
  * `GET /orders/history`: Paginated rider delivery history (`ROUTING_*` / `COMPLETED` assignments) to power bottom Task Bar `Orders`.
  * `GET /earnings/transactions`: Paginated earnings/bonus/payout ledger to power bottom Task Bar `Earnings`.
  * `POST /payouts/instant` *(plus alias `/api/wallet/withdraw` if needed, protected by `approvedRiderAuth` + `idempotencyMiddleware()`)*:
    * Validates saved verified `BankAccount` / UPI and minimum withdrawal (`amount > 10`).
    * Performs **atomic conditional debit** (`findOneAndUpdate({ riderId, walletBalance: { $gte: amount } }, { $inc: { walletBalance: -amount } })`) inside a MongoDB transaction so concurrent payout requests cannot overdraft.
    * Invokes a new `PayoutProvider` adapter (`CircuitBreaker`) and returns `{ referenceId, destinationDisplay, transferredAmount, newBalance, status }`.
* **Verification:** `test/rider-wallet.test.js` verifying concurrent payout overdraft protection, idempotency replay, and ledger reconciliation (`balanceAfter` consistency).

---

### Phase 5 — Offline TOTP Verification, Queue Sync & Notifications

* **New Collections (`src/modules/delivery/models/index.js`):**
  * **`OfflineSyncLog` (`offline_sync_logs`):** `riderId`, `clientActionId` (compound unique `{ riderId, clientActionId }`), `actionType` (`"COMPLETED_JOB"` | `"SMS_FALLBACK"`), `rawPayload`, `resultStatus`, `syncedAt`.
  * **`RiderNotification` (`rider_notifications`):** `riderId`, `title`, `description`, `type` (`"eco" | "wallet" | "service" | "alert"`), `read` (Boolean, default `false`), `meta`.
* **New Sub-Modules (`src/modules/delivery/offline/` & `notifications/`):**
  * Replace static `'METKART_SECRET'` / `'1234'` prototype simulation with server-verified per-order HMAC-SHA256 4-digit TOTP across `[currentWindow, previousWindow]` (10-minute step) shared identically with the Customer app order screen (`MyEcoOrdersPage`) and verified in `POST /orders/:orderId/complete` (`mode: "OFFLINE_TOTP"`).
  * `POST /offline/sync` (`approvedRiderAuth` + `idempotencyMiddleware()`): Reconciles queued offline completions idempotently via `(riderId, clientActionId)` and parses `MK|JOB|...` fallback payloads.
  * `GET /notifications`, `PATCH /notifications/read-all`, `DELETE /notifications/:id`: Back `NotificationModal` and trigger notifications on admin review decisions (replacing the `console.log` stub in `admin.service.js`), trip completion, daily bonus unlock, `PLATINUM` promotion, and instant payout completion.
* **Verification:** `test/rider-offline-notifications.test.js` covering 10-min TOTP window verification (valid, previous-window skew, expired), duplicate offline sync idempotency, and notification CRUD.

---

### Phase 6 — Production Adapter Hardening & Courier Branch (Gated)

* **Storage & External Gateway Upgrades (`src/modules/delivery/adapters/index.js`):**
  * Add S3 / Cloudflare R2 / GCS backend to `StorageProvider` (configured via env vars) so uploaded rider KYC documents survive Render restarts.
  * Implement real provider branches (`PROVIDER_MODE=real`) for Aadhaar KYC (`KycProvider`), Selfie Liveness/Face Match (`FaceMatchProvider`), IFSC/Bank Penny-Drop/UPI (`BankProvider`), and Bank/UPI settlements (`PayoutProvider`) behind existing `CircuitBreaker`.
* **Courier Service Branch (`S16`–`S20`, Gated on Clarification #5):**
  * Add `CourierZone` (`courier_zones`) and `CourierApplication` (`courier_applications`) schemas, unlock `"COURIER"` in `RiderProfile.rideType` and `saveRideType()`, and implement `/api/courier/zones` + `/api/courier/onboarding` + required post-work-area GSTIN/warehouse/pincodes/bank/approval endpoints once finalized.
