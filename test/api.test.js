const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/app");
const { validateCredentials } = require("../src/modules/auth/auth.validation");
const {
  validateVendorRegistration,
  validateVendorProfileUpdate,
  validatePasswordChange,
} = require("../src/modules/vendor/vendor.validation");
const authorize = require("../src/middleware/authorize");

const config = {
  jwtSecret: "test-secret-that-is-long-enough-for-this-test",
  jwtExpiresIn: "7d",
  corsOrigin: "*",
};

test("health endpoint returns status", async () => {
  const response = await request(createApp(config)).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { status: "ok" });
});

test("registration allows user categories but rejects privileged app roles", () => {
  const base = { name: "Test User", email: "TEST@example.com", password: "password123" };
  const allowed = validateCredentials({ ...base, role: "food" }, { registration: true });
  assert.deepEqual(allowed.errors, []);
  assert.equal(allowed.value.email, "test@example.com");

  const vendor = validateCredentials({ ...base, role: "vendor" }, { registration: true });
  assert.ok(vendor.errors.some((error) => error.includes("must be provisioned")));

  const delivery = validateCredentials(
    { ...base, role: "delivery_boy" },
    { registration: true }
  );
  assert.ok(delivery.errors.some((error) => error.includes("must be provisioned")));
});

test("registration rejects invalid role and weak password", () => {
  const result = validateCredentials(
    { name: "Test", email: "bad-email", password: "short", role: "admin" },
    { registration: true }
  );
  assert.ok(result.errors.length >= 3);
});

test("vendor registration validates required fields and assigns only vendor role", () => {
  const result = validateVendorRegistration({
    name: "Vendor Owner",
    email: "vendor@example.com",
    password: "password123",
    businessName: "Asha Foods",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.role, "vendor");
  assert.equal(result.value.vendorProfile.businessName, "Asha Foods");

  const invalid = validateVendorRegistration({ name: "Vendor", role: "delivery_boy" });
  assert.ok(invalid.errors.length > 0);
});

test("vendor profile update only accepts supported profile fields", () => {
  const result = validateVendorProfileUpdate({
    businessName: "Updated Foods",
    address: { city: "Pune", postalCode: "411001" },
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.address.city, "Pune");

  const invalid = validateVendorProfileUpdate({ role: "delivery_boy" });
  assert.ok(invalid.errors.some((error) => error.includes("Unsupported profile fields")));
});

test("vendor password change validates current and new passwords", () => {
  assert.deepEqual(
    validatePasswordChange({
      currentPassword: "oldpassword",
      newPassword: "newpassword",
    }).errors,
    []
  );
  assert.ok(
    validatePasswordChange({
      currentPassword: "samepassword",
      newPassword: "samepassword",
    }).errors.length > 0
  );
});

test("vendor profile APIs require authentication", async () => {
  const app = createApp(config);
  for (const [method, path] of [
    ["get", "/api/v1/vendor/profile"],
    ["patch", "/api/v1/vendor/profile"],
    ["patch", "/api/v1/vendor/change-password"],
  ]) {
    const response = await request(app)[method](path).send({});
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`);
  }
});

test("vendor business type and shop type APIs require an admin token", async () => {
  const app = createApp(config);
  const routes = [
    ["post", "/api/admin/vendor/businesstype"],
    ["get", "/api/admin/vendor/businesstype"],
    ["get", "/api/admin/vendor/businesstype/123"],
    ["put", "/api/admin/vendor/businesstype/123"],
    ["delete", "/api/admin/vendor/businesstype/123"],
    ["post", "/api/admin/vendor/shoptype/123"],
    ["get", "/api/admin/vendor/shoptype/by-business/123"],
    ["get", "/api/admin/vendor/shoptype/123"],
    ["put", "/api/admin/vendor/shoptype/123"],
    ["delete", "/api/admin/vendor/shoptype/123"],
  ];

  for (const [method, path] of routes) {
    const response = await request(app)[method](path).send({});
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`);
  }
});

test("authorization allows and denies roles", async () => {
  const middleware = authorize("vendor");
  const allowed = await new Promise((resolve) => {
    middleware({ account: { role: "vendor" } }, {}, (error) => resolve(error));
  });
  assert.equal(allowed, undefined);

  const denied = await new Promise((resolve) => {
    middleware({ account: { role: "food" } }, {}, (error) => resolve(error));
  });
  assert.equal(denied.statusCode, 403);
});

test("unknown routes return a consistent 404 error", async () => {
  const response = await request(createApp(config)).get("/missing");
  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.match(response.body.error.message, /Route not found/);
});
