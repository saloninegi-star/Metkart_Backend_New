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

All API routes use the `/api/v1` prefix and JSON.

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
