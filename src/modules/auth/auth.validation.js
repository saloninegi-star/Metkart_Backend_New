const { ACCOUNT_ROLES } = require("../accounts/account.model");
const USER_APP_ROLES = ACCOUNT_ROLES.slice(0, 4);

function validateCredentials(body, { registration = false } = {}) {
  const errors = [];
  const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (registration && (!name || name.length > 100)) {
    errors.push("Name is required and must be at most 100 characters");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    errors.push("A valid email is required");
  }
  if (registration && password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (!registration && !password) {
    errors.push("Password is required");
  }

  let role;
  if (registration) {
    if (typeof input.role !== "string" || !ACCOUNT_ROLES.includes(input.role)) {
      errors.push(`Role must be one of: ${ACCOUNT_ROLES.join(", ")}`);
    } else if (!USER_APP_ROLES.includes(input.role)) {
      errors.push("Vendor and delivery accounts must be provisioned by an administrator");
    } else {
      role = input.role;
    }
  }

  return {
    errors,
    value: { name, email, password, role },
  };
}

module.exports = { validateCredentials, USER_APP_ROLES };
