# Metkart Backend — Design System & Project Plan

**Status**: Approved
**Created**: 2026-11-02
**Mode**: API only

## 1. Project Overview

Build a simple Node.js and Express backend for Metkart as a modular monolith. It serves one user app with food, recycle, mechanic, and grocery service categories, plus separate vendor and delivery-boy app audiences. Keep the starter focused on API foundations, authentication, and role-based access control; do not invent ordering, payment, dispatch, or other domain workflows.

## 2. Goals and Scope

- Provide a clean, maintainable module and folder structure within one deployable application.
- Support sign-in and RBAC for the six app roles: `food`, `recycle`, `mechanic`, `grocery`, `vendor`, and `delivery_boy`.
- Allow public registration only for the four user-app categories; vendor and delivery-boy accounts must be provisioned through a controlled process, not by choosing a privileged role during public signup.
- Protect role-specific API routes with authentication and RBAC middleware.
- Persist account data in MongoDB through Mongoose.
- Configure the MongoDB connection by changing only `MONGODB_URI`; do not require a separate database name or host setting.
- Include health/status endpoints and basic request validation and error handling.
- Exclude frontend applications, service-specific transactions, vendor listings, delivery dispatch, payments, notifications, and external integrations from this starter.

## 3. Architecture & Services

**Application type**: API only  
**Deployment unit**: One Node.js process / modular monolith  
**Service**: `backend` — Express REST API  
**Runtime and framework**: Node.js (JavaScript), Express  
**Persistence**: MongoDB using Mongoose

Organize the code by responsibility and feature, for example:

```text
src/
  app.js
  server.js
  config/
    database.js
    environment.js
  middleware/
    authenticate.js
    authorize.js
    error-handler.js
    validate.js
  modules/
    auth/
      auth.routes.js
      auth.controller.js
      auth.service.js
      auth.validation.js
    accounts/
      account.model.js
      account.routes.js
      account.controller.js
      account.service.js
    health/
      health.routes.js
  utils/
    ApiError.js
    async-handler.js
tests/
```

Keep HTTP routing/controllers thin; put validation and business-independent account/auth operations in module services. Feature modules may be added later without splitting the application into microservices.

## 4. Data Model

Start with one `Account` collection:

- `name`: required display name.
- `email`: required, normalized, unique sign-in identifier.
- `passwordHash`: required; never store the raw password.
- `role`: required enum of `food`, `recycle`, `mechanic`, `grocery`, `vendor`, or `delivery_boy`.
- `createdAt` and `updatedAt`: managed timestamps.

The four user-app categories are represented as distinct RBAC roles, while vendor and delivery-boy accounts have their own roles. Public registration may assign only one of the four user-app categories; vendor and delivery-boy role assignment is restricted to controlled provisioning. Avoid separate domain/profile collections until a confirmed workflow requires them. Use Mongoose schema validation and a unique index on normalized email.

## 5. API Design

Use a versioned `/api/v1` prefix and JSON responses.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Liveness/status response |
| POST | `/api/v1/auth/register` | Public | Create an account in one of the four user-app categories only |
| POST | `/api/v1/auth/login` | Public | Verify credentials and issue a JWT |
| GET | `/api/v1/accounts/me` | Authenticated | Return the signed-in account's safe profile |
| GET | `/api/v1/vendor/me` | `vendor` | Vendor-app role boundary / starter endpoint |
| GET | `/api/v1/delivery/me` | `delivery_boy` | Delivery-app role boundary / starter endpoint |
| GET | `/api/v1/user-app/me` | `food`, `recycle`, `mechanic`, or `grocery` | User-app role boundary / starter endpoint |

Use a shared auth module and reusable role authorization middleware. Reject public signup attempts for `vendor` or `delivery_boy`; assign those roles only via controlled provisioning (the provisioning workflow is not part of this starter). Return a consistent error envelope with appropriate HTTP status codes. Never include password hashes in responses. Keep the role-specific routes as minimal access-boundary examples rather than implying completed service workflows.

## 6. Design System & UI

**Component Library**: Not applicable — this is an API-only backend with no frontend UI.

The API contract is the design surface for this project: use a consistent JSON response/error shape, versioned routes, and documented role requirements. No UI components, web pages, or preview pages are in scope.

## 7. Security & Configuration

- Load configuration from environment variables and provide a committed `.env.example` with placeholders only.
- Read the MongoDB connection string exclusively from `MONGODB_URI`. The database name may be part of that URI; changing databases requires changing that URI only.
- Use a separate `JWT_SECRET` and a documented token expiry setting; never commit real secrets.
- Hash passwords with a suitable password-hashing library before storage; compare hashes at login.
- Verify JWTs in authentication middleware and enforce role allowlists in authorization middleware.
- Validate request bodies, normalize email, limit request payload size, and use secure Express defaults and security headers.
- Keep error responses free of stack traces and sensitive implementation details in production.

## 8. Local Development & Verification

- Provide `npm` scripts for development, start, and tests.
- On startup, validate required environment variables, connect to MongoDB using `MONGODB_URI`, and only then accept requests.
- On shutdown, close the HTTP server and MongoDB connection cleanly.
- Add focused tests for health status, registration/login validation, password hashing, JWT authentication, and allow/deny behavior for each role.
- Document setup, environment variables, API routes, and sample requests in the project README.
- Verify the API with automated tests and a local smoke test once scaffolded. No Azure resource or deployment workflow is required for this API-only starter plan.
