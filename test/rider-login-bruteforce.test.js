const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { PassThrough } = require("stream");
const express = require("express");
const mongoose = require("mongoose");

const { createDeliveryModule } = require("../src/modules/delivery");
const createAuthRoutes = require("../src/modules/auth/auth.routes");
const { errorHandler } = require("../src/middleware/error-handler");
const { hashPassword } = require("../src/modules/delivery/lib/crypto");
const { deliveryEnv } = require("../src/modules/delivery/config/env");
const authService = require("../src/modules/delivery/auth/auth.service");
const {
  RiderUser,
  RiderProfile,
  RefreshToken,
  LoginAttempt,
  AuditLog,
} = require("../src/modules/delivery/models");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Invokes an Express app in-process without binding a TCP port.
 * Uses distinct remoteAddress values per scenario so IP-based middleware rate limits
 * remain isolated from per-account brute-force lockout assertions.
 */
async function invokeApp(app, { method = "POST", url, body = null, headers = {}, remoteAddress = "127.0.0.1" }) {
  const socket = new PassThrough();
  socket.remoteAddress = remoteAddress;

  const req = new http.IncomingMessage(socket);
  req.method = method.toUpperCase();
  req.url = url;

  const rawBody = body === null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body), "utf8");
  const normalizedHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    normalizedHeaders[k.toLowerCase()] = v;
  }
  if (body !== null && !normalizedHeaders["content-type"]) {
    normalizedHeaders["content-type"] = "application/json";
  }
  if (rawBody.length > 0 && !normalizedHeaders["content-length"]) {
    normalizedHeaders["content-length"] = String(rawBody.length);
  }
  req.headers = normalizedHeaders;

  const res = new http.ServerResponse(req);
  const chunks = [];
  res.write = (chunk) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };

  return new Promise((resolve, reject) => {
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      let parsedBody = text;
      try {
        parsedBody = text ? JSON.parse(text) : null;
      } catch {
        // leave text as-is
      }
      resolve({ status: res.statusCode, body: parsedBody });
    };

    app.handle(req, res, (err) => {
      if (err) reject(err);
    });

    if (rawBody.length > 0) req.push(rawBody);
    req.push(null);
  });
}

/**
 * Evaluates MongoDB aggregation-pipeline expressions used in LoginAttempt.findOneAndUpdate
 * so tests execute the exact server pipeline expressions emitted by auth.service.js.
 */
function evalAggExpr(expr, doc, vars = {}) {
  if (expr === null || expr === undefined) return expr;
  if (expr instanceof Date) return new Date(expr.getTime());
  if (Array.isArray(expr)) {
    return expr.map((item) => evalAggExpr(item, doc, vars));
  }
  if (typeof expr === "string") {
    if (expr.startsWith("$$")) {
      return vars[expr.slice(2)];
    }
    if (expr.startsWith("$")) {
      return doc[expr.slice(1)];
    }
    return expr;
  }
  if (typeof expr !== "object") {
    return expr;
  }

  if ("$ifNull" in expr) {
    const [primary, fallback] = expr.$ifNull;
    const val = evalAggExpr(primary, doc, vars);
    return val === null || val === undefined ? evalAggExpr(fallback, doc, vars) : val;
  }
  if ("$and" in expr) {
    return expr.$and.every((sub) => Boolean(evalAggExpr(sub, doc, vars)));
  }
  if ("$or" in expr) {
    return expr.$or.some((sub) => Boolean(evalAggExpr(sub, doc, vars)));
  }
  if ("$eq" in expr) {
    const [a, b] = expr.$eq.map((x) => evalAggExpr(x, doc, vars));
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return (a ?? null) === (b ?? null);
  }
  if ("$ne" in expr) {
    const [a, b] = expr.$ne.map((x) => evalAggExpr(x, doc, vars));
    if (a instanceof Date && b instanceof Date) return a.getTime() !== b.getTime();
    return (a ?? null) !== (b ?? null);
  }
  if ("$gt" in expr) {
    const [a, b] = expr.$gt.map((x) => evalAggExpr(x, doc, vars));
    if (a == null || b == null) return false;
    const va = a instanceof Date ? a.getTime() : a;
    const vb = b instanceof Date ? b.getTime() : b;
    return va > vb;
  }
  if ("$lte" in expr) {
    const [a, b] = expr.$lte.map((x) => evalAggExpr(x, doc, vars));
    if (a == null || b == null) return false;
    const va = a instanceof Date ? a.getTime() : a;
    const vb = b instanceof Date ? b.getTime() : b;
    return va <= vb;
  }
  if ("$gte" in expr) {
    const [a, b] = expr.$gte.map((x) => evalAggExpr(x, doc, vars));
    if (a == null || b == null) return false;
    const va = a instanceof Date ? a.getTime() : a;
    const vb = b instanceof Date ? b.getTime() : b;
    return va >= vb;
  }
  if ("$filter" in expr) {
    const input = evalAggExpr(expr.$filter.input, doc, vars) || [];
    const asName = expr.$filter.as || "this";
    return input.filter((item) => Boolean(evalAggExpr(expr.$filter.cond, doc, { ...vars, [asName]: item })));
  }
  if ("$concatArrays" in expr) {
    return expr.$concatArrays.reduce((acc, sub) => acc.concat(evalAggExpr(sub, doc, vars) || []), []);
  }
  if ("$slice" in expr) {
    const [arrExpr, countExpr] = expr.$slice;
    const arr = evalAggExpr(arrExpr, doc, vars) || [];
    const count = evalAggExpr(countExpr, doc, vars);
    return count < 0 ? arr.slice(count) : arr.slice(0, count);
  }
  if ("$size" in expr) {
    const arr = evalAggExpr(expr.$size, doc, vars) || [];
    return arr.length;
  }
  if ("$cond" in expr) {
    const flag = evalAggExpr(expr.$cond.if, doc, vars);
    return evalAggExpr(flag ? expr.$cond.then : expr.$cond.else, doc, vars);
  }

  throw new Error(`Unsupported aggregation expression operator: ${Object.keys(expr).join(", ")}`);
}

function matchesLoginAttemptFilter(doc, filter) {
  if (filter.identifier && doc.identifier !== filter.identifier) return false;
  if (Array.isArray(filter.$or)) {
    const anyMatch = filter.$or.some((clause) => {
      if ("lockedUntil" in clause) {
        if (clause.lockedUntil === null) return doc.lockedUntil == null;
        if (clause.lockedUntil && clause.lockedUntil.$lte) {
          return doc.lockedUntil != null && new Date(doc.lockedUntil) <= new Date(clause.lockedUntil.$lte);
        }
      }
      return false;
    });
    if (!anyMatch) return false;
  }
  return true;
}

function createPersistentLoginDb(initialState = {}) {
  let seq = 1;
  const users = initialState.users || [];
  const profiles = initialState.profiles || [];
  const refreshTokens = initialState.refreshTokens || [];
  const loginAttempts = initialState.loginAttempts || [];
  const audits = initialState.audits || [];

  const nextId = () => new mongoose.Types.ObjectId((seq++).toString(16).padStart(24, "0"));

  function wrapFindQuery(arr, predicate) {
    const matches = arr.filter(predicate);
    const chain = {
      sort() {
        return chain;
      },
      select() {
        return Promise.resolve(matches[0] || null);
      },
      lean() {
        return Promise.resolve(matches[0] ? structuredClone(matches[0]) : null);
      },
      then(resolve, reject) {
        return Promise.resolve(matches[0] || null).then(resolve, reject);
      },
    };
    return chain;
  }

  return {
    users,
    profiles,
    refreshTokens,
    loginAttempts,
    audits,
    installStubs({ simulateConcurrentUpsertRace = false, userQueryError = null } = {}) {
      let injectedDuplicateRace = false;

      const originals = {
        userFindOne: RiderUser.findOne,
        profileFindOne: RiderProfile.findOne,
        refreshCreate: RefreshToken.create,
        loginAttemptFindOne: LoginAttempt.findOne,
        loginAttemptFindOneAndUpdate: LoginAttempt.findOneAndUpdate,
        auditCreate: AuditLog.create,
      };

      RiderUser.findOne = (filter) => {
        if (userQueryError) {
          return {
            select() {
              return Promise.reject(userQueryError);
            },
            then(_, reject) {
              return Promise.reject(userQueryError).then(undefined, reject);
            },
          };
        }
        return wrapFindQuery(users, (u) => {
          if (filter.email && u.email !== filter.email) return false;
          if (filter._id && String(u._id) !== String(filter._id)) return false;
          return true;
        });
      };

      RiderProfile.findOne = (filter) =>
        wrapFindQuery(profiles, (p) => !filter.userId || String(p.userId) === String(filter.userId));

      RefreshToken.create = async (doc) => {
        const item = { _id: nextId(), revokedAt: null, ...doc };
        refreshTokens.push(item);
        return item;
      };

      LoginAttempt.findOne = (filter) =>
        wrapFindQuery(loginAttempts, (a) => matchesLoginAttemptFilter(a, filter));

      // Simulates atomic single-document MongoDB findOneAndUpdate semantics on an identifier.
      LoginAttempt.findOneAndUpdate = async (filter, update, options = {}) => {
        // Yield once to simulate DB round-trip and expose any caller-side race bugs.
        await Promise.resolve();

        if (simulateConcurrentUpsertRace && options.upsert && !injectedDuplicateRace && loginAttempts.length > 0) {
          injectedDuplicateRace = true;
          const dupErr = new Error("E11000 duplicate key error collection: login_attempts");
          dupErr.code = 11000;
          throw dupErr;
        }

        let target = loginAttempts.find((doc) => matchesLoginAttemptFilter(doc, filter));

        if (!target) {
          if (!options.upsert) {
            return null;
          }
          target = {
            _id: nextId(),
            identifier: filter.identifier,
            failedTimestamps: [],
            lockedUntil: null,
            expiresAt: null,
            createdAt: null,
            updatedAt: null,
          };
          loginAttempts.push(target);
        }

        if (Array.isArray(update)) {
          let working = { ...target };
          for (const stage of update) {
            if (stage.$set) {
              const nextValues = {};
              for (const [key, valueExpr] of Object.entries(stage.$set)) {
                nextValues[key] = evalAggExpr(valueExpr, working);
              }
              working = { ...working, ...nextValues };
            }
          }
          Object.assign(target, working, { updatedAt: new Date() });
        } else if (update && update.$set) {
          Object.assign(target, update.$set, { updatedAt: new Date() });
        }

        return structuredClone(target);
      };

      AuditLog.create = async (docOrDocs) => {
        const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
        audits.push(...docs);
        return docOrDocs;
      };

      return {
        restore() {
          RiderUser.findOne = originals.userFindOne;
          RiderProfile.findOne = originals.profileFindOne;
          RefreshToken.create = originals.refreshCreate;
          LoginAttempt.findOne = originals.loginAttemptFindOne;
          LoginAttempt.findOneAndUpdate = originals.loginAttemptFindOneAndUpdate;
          AuditLog.create = originals.auditCreate;
        },
      };
    },
  };
}

function createTestExpressApp() {
  const app = express();
  app.use(express.json());

  const deliveryRouter = createDeliveryModule();
  app.use("/api/delivery", deliveryRouter);
  app.use("/api/rider", deliveryRouter);
  app.use(
    "/api/v1/auth",
    createAuthRoutes({
      jwtSecret: deliveryEnv.JWT_SECRET,
      jwtExpiresIn: "15m",
    })
  );

  app.use(errorHandler);
  return app;
}

async function seedRider(db, { email = "rider.brute@metkart.com", password = "CorrectPass@123" } = {}) {
  const userId = new mongoose.Types.ObjectId();
  const passwordHash = await hashPassword(password, 4);
  db.users.push({
    _id: userId,
    email: email.toLowerCase().trim(),
    passwordHash,
    role: "RIDER",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    status: "ACTIVE",
  });
  db.profiles.push({
    _id: new mongoose.Types.ObjectId(),
    userId,
    completedSteps: [],
    status: "IN_PROGRESS",
  });
  return userId;
}

// =========================================================================
// Schema & Mongoose Compatibility Check
// =========================================================================
test("LoginAttempt schema: defines unique identifier index, TTL expiry index, and compiles update pipeline", () => {
  const indexes = LoginAttempt.schema.indexes();
  const hasUniqueIdentifier = indexes.some(
    ([fields, opts]) => fields.identifier === 1 && opts.unique === true
  );
  const hasTtlIndex = indexes.some(
    ([fields, opts]) => fields.expiresAt === 1 && opts.expireAfterSeconds === 0
  );
  assert.equal(hasUniqueIdentifier, true);
  assert.equal(hasTtlIndex, true);

  const query = LoginAttempt.findOneAndUpdate(
    { identifier: "check@metkart.com" },
    [{ $set: { identifier: "check@metkart.com" } }],
    { upsert: true, new: true }
  );
  assert.ok(Array.isArray(query.getUpdate()));
});

// =========================================================================
// Scenarios 1-5: 1st fail (2 left), 2nd fail (1 left), 3rd fail (locked),
// correct password while locked, and further attempts during lockout
// =========================================================================
test("Scenarios 1-5: tracks 3 consecutive failures via HTTP, locks on 3rd, and blocks all attempts (even valid password) while locked", async () => {
  const db = createPersistentLoginDb();
  const harness = db.installStubs();
  const app = createTestExpressApp();

  try {
    await seedRider(db, { email: "rider.lockout@metkart.com", password: "ValidPass@123" });

    // 1. First incorrect password -> 401, 2 attempts remaining
    const res1 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.1",
      body: { email: "  RIDER.Lockout@Metkart.COM ", password: "Wrong1" },
    });
    assert.equal(res1.status, 401);
    assert.equal(res1.body.success, false);
    assert.equal(res1.body.error.code, "INVALID_CREDENTIALS");
    assert.equal(res1.body.error.details.remainingAttempts, 2);

    // 2. Second incorrect password -> 401, 1 attempt remaining
    const res2 = await invokeApp(app, {
      url: "/api/rider/auth/login",
      remoteAddress: "10.0.0.1",
      body: { email: "rider.lockout@metkart.com", password: "Wrong2" },
    });
    assert.equal(res2.status, 401);
    assert.equal(res2.body.error.code, "INVALID_CREDENTIALS");
    assert.equal(res2.body.error.details.remainingAttempts, 1);

    // 3. Third incorrect password -> 423 account locked, 0 attempts remaining
    const res3 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.1",
      body: { email: "rider.lockout@metkart.com", password: "Wrong3" },
    });
    assert.equal(res3.status, 423);
    assert.equal(res3.body.error.code, "ACCOUNT_LOCKED");
    assert.equal(res3.body.error.details.remainingAttempts, 0);
    assert.ok(res3.body.error.details.lockedUntil);
    assert.ok(res3.body.error.details.retryAfterSeconds > 23 * 3600);

    const lockedUntilBefore = db.loginAttempts[0].lockedUntil;
    assert.equal(db.loginAttempts[0].failedTimestamps.length, 3);
    assert.equal(db.audits.some((a) => a.action === "RIDER_LOGIN_LOCKED"), true);

    // Security check: no password/hash persisted in attempt record
    const persistedKeys = Object.keys(db.loginAttempts[0]);
    assert.equal(persistedKeys.includes("password"), false);
    assert.equal(persistedKeys.includes("passwordHash"), false);

    // 4. Correct password while locked -> rejected 423, no tokens issued
    const res4 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.1",
      body: { email: "rider.lockout@metkart.com", password: "ValidPass@123" },
    });
    assert.equal(res4.status, 423);
    assert.equal(res4.body.error.code, "ACCOUNT_LOCKED");
    assert.equal(db.refreshTokens.length, 0);

    // 5. Further failed login attempt during lockout -> rejected 423, lock not extended & counter capped at 3
    const res5 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.1",
      body: { email: "rider.lockout@metkart.com", password: "Wrong4" },
    });
    assert.equal(res5.status, 423);
    assert.equal(res5.body.error.code, "ACCOUNT_LOCKED");
    assert.equal(db.loginAttempts[0].failedTimestamps.length, 3);
    assert.equal(
      new Date(db.loginAttempts[0].lockedUntil).getTime(),
      new Date(lockedUntilBefore).getTime()
    );
  } finally {
    harness.restore();
  }
});

// =========================================================================
// Scenario 6: Login after 24h restriction expires + Rolling 24h window
// =========================================================================
test("Scenario 6: allows login after 24-hour lockout expires and enforces rolling 24-hour failure window", async () => {
  const db = createPersistentLoginDb();
  const harness = db.installStubs();

  try {
    await seedRider(db, { email: "rolling@metkart.com", password: "ValidPass@123" });
    await seedRider(db, { email: "expired.lock@metkart.com", password: "ValidPass@123" });

    const t0 = new Date("2026-11-26T00:00:00.000Z");

    // Trigger lockout on expired.lock@metkart.com at t0..t0+2s
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(
        () =>
          authService.loginRider(
            { email: "expired.lock@metkart.com", password: "Wrong" },
            { now: new Date(t0.getTime() + i * 1000) }
          ),
        (err) => err.httpStatus === (i < 2 ? 401 : 423)
      );
    }

    // Still locked at 23h 59m 59s after 3rd attempt
    await assert.rejects(
      () =>
        authService.loginRider(
          { email: "expired.lock@metkart.com", password: "ValidPass@123" },
          { now: new Date(t0.getTime() + 2000 + DAY_MS - 1000) }
        ),
      (err) => err.code === "ACCOUNT_LOCKED" && err.httpStatus === 423
    );

    // Allowed at exact 24h expiration (and wrong password starts a fresh cycle of 2 remaining)
    await assert.rejects(
      () =>
        authService.loginRider(
          { email: "expired.lock@metkart.com", password: "WrongAgain" },
          { now: new Date(t0.getTime() + 2000 + DAY_MS) }
        ),
      (err) =>
        err.code === "INVALID_CREDENTIALS" &&
        err.httpStatus === 401 &&
        err.details.remainingAttempts === 2
    );

    // Valid login right after expiry succeeds cleanly and clears state
    const successRes = await authService.loginRider(
      { email: "expired.lock@metkart.com", password: "ValidPass@123" },
      { now: new Date(t0.getTime() + 2000 + DAY_MS + 5000) }
    );
    assert.ok(successRes.accessToken);
    assert.ok(successRes.refreshToken);
    assert.equal(successRes.user.email, "expired.lock@metkart.com");
    assert.equal(successRes.onboarding.status, "IN_PROGRESS");

    // Rolling 24h window test: failures at T=0 and T=10h, then T=24h+1m -> T=0 dropped out!
    await assert.rejects(
      () => authService.loginRider({ email: "rolling@metkart.com", password: "Bad1" }, { now: t0 }),
      (err) => err.details.remainingAttempts === 2
    );
    await assert.rejects(
      () =>
        authService.loginRider(
          { email: "rolling@metkart.com", password: "Bad2" },
          { now: new Date(t0.getTime() + 10 * HOUR_MS) }
        ),
      (err) => err.details.remainingAttempts === 1
    );
    // At T=24h + 1m: t0 is outside rolling 24h window, so active failures = [10h, 24h+1m] -> count 2, NOT locked!
    await assert.rejects(
      () =>
        authService.loginRider(
          { email: "rolling@metkart.com", password: "Bad3" },
          { now: new Date(t0.getTime() + DAY_MS + 60_000) }
        ),
      (err) => err.code === "INVALID_CREDENTIALS" && err.details.remainingAttempts === 1
    );
    // Next failure at T=24h + 2m makes 3 within rolling 24h -> locked!
    await assert.rejects(
      () =>
        authService.loginRider(
          { email: "rolling@metkart.com", password: "Bad4" },
          { now: new Date(t0.getTime() + DAY_MS + 120_000) }
        ),
      (err) => err.code === "ACCOUNT_LOCKED" && err.httpStatus === 423
    );
  } finally {
    harness.restore();
  }
});

// =========================================================================
// Scenario 7: Successful login before reaching limit resets counter
// =========================================================================
test("Scenario 7: resets failed-attempt counter after successful login before lockout", async () => {
  const db = createPersistentLoginDb();
  const harness = db.installStubs();
  const app = createTestExpressApp();

  try {
    await seedRider(db, { email: "reset.counter@metkart.com", password: "ValidPass@123" });

    // Fail twice (1 attempt remaining)
    const f1 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.2",
      body: { email: "reset.counter@metkart.com", password: "Bad1" },
    });
    assert.equal(f1.status, 401);
    assert.equal(f1.body.error.details.remainingAttempts, 2);

    const f2 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.2",
      body: { email: "reset.counter@metkart.com", password: "Bad2" },
    });
    assert.equal(f2.status, 401);
    assert.equal(f2.body.error.details.remainingAttempts, 1);

    // Succeed on 3rd attempt -> resets counter & preserves exact success payload structure
    const okRes = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.2",
      body: { email: "reset.counter@metkart.com", password: "ValidPass@123" },
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.success, true);
    assert.ok(okRes.body.data.accessToken);
    assert.ok(okRes.body.data.refreshToken);
    assert.equal(okRes.body.data.user.role, "RIDER");
    assert.equal(db.loginAttempts[0].failedTimestamps.length, 0);
    assert.equal(db.loginAttempts[0].lockedUntil, null);

    // Next wrong password starts back at 2 remaining
    const afterResetFail = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.2",
      body: { email: "reset.counter@metkart.com", password: "Bad3" },
    });
    assert.equal(afterResetFail.status, 401);
    assert.equal(afterResetFail.body.error.details.remainingAttempts, 2);
  } finally {
    harness.restore();
  }
});

// =========================================================================
// Scenario 8: Independent counters per account + anti-enumeration parity
// =========================================================================
test("Scenario 8 & Anti-Enumeration: tracks accounts independently and reveals nothing for unknown emails", async () => {
  const db = createPersistentLoginDb();
  const harness = db.installStubs();
  const app = createTestExpressApp();

  try {
    await seedRider(db, { email: "rider.a@metkart.com", password: "ValidPass@123" });
    await seedRider(db, { email: "rider.b@metkart.com", password: "ValidPass@123" });

    // Lock rider.a completely
    for (let i = 0; i < 3; i += 1) {
      await invokeApp(app, {
        url: "/api/delivery/auth/login",
        remoteAddress: "10.0.0.3",
        body: { email: "rider.a@metkart.com", password: "Wrong" },
      });
    }

    // rider.b remains completely unaffected and can fail once (2 remaining) then log in
    const bFail = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.3",
      body: { email: "rider.b@metkart.com", password: "Wrong" },
    });
    assert.equal(bFail.status, 401);
    assert.equal(bFail.body.error.details.remainingAttempts, 2);

    const bSuccess = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.3",
      body: { email: "rider.b@metkart.com", password: "ValidPass@123" },
    });
    assert.equal(bSuccess.status, 200);

    // Unknown account follows identical failure & lockout response messages as known accounts
    const unknown1 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.4",
      body: { email: "ghost@metkart.com", password: "Wrong" },
    });
    const known1 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.5",
      body: { email: "rider.b@metkart.com", password: "Wrong" },
    });
    assert.equal(unknown1.status, known1.status);
    assert.equal(unknown1.body.error.code, known1.body.error.code);
    assert.equal(unknown1.body.error.message, known1.body.error.message);
    assert.equal(unknown1.body.error.details.remainingAttempts, known1.body.error.details.remainingAttempts);

    // Exhaust ghost@metkart.com -> locks identically at 3rd attempt
    await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.4",
      body: { email: "ghost@metkart.com", password: "Wrong" },
    });
    const unknown3 = await invokeApp(app, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.4",
      body: { email: "ghost@metkart.com", password: "Wrong" },
    });
    assert.equal(unknown3.status, 423);
    assert.equal(unknown3.body.error.code, "ACCOUNT_LOCKED");
  } finally {
    harness.restore();
  }
});

// =========================================================================
// Scenario 9: Persistence across simulated server restarts
// =========================================================================
test("Scenario 9: persisted attempts and lockout survive module & server restart", async () => {
  // Serialized persistent snapshot representing MongoDB storage on disk across process restarts
  const serializedSnapshots = { users: [], profiles: [], loginAttempts: [] };

  const dbBoot1 = createPersistentLoginDb();
  let harness = dbBoot1.installStubs();

  try {
    await seedRider(dbBoot1, { email: "restart.rider@metkart.com", password: "ValidPass@123" });

    // 2 failed attempts before restart
    await assert.rejects(
      () => authService.loginRider({ email: "restart.rider@metkart.com", password: "Wrong1" }),
      (err) => err.details.remainingAttempts === 2
    );
    await assert.rejects(
      () => authService.loginRider({ email: "restart.rider@metkart.com", password: "Wrong2" }),
      (err) => err.details.remainingAttempts === 1
    );

    serializedSnapshots.users = structuredClone(dbBoot1.users);
    serializedSnapshots.profiles = structuredClone(dbBoot1.profiles);
    serializedSnapshots.loginAttempts = structuredClone(dbBoot1.loginAttempts);
  } finally {
    harness.restore();
  }

  // Simulate full Node server module cache clear & reboot
  const pathsToReload = [
    require.resolve("../src/modules/delivery/auth/auth.service"),
    require.resolve("../src/modules/delivery/auth/auth.controller"),
    require.resolve("../src/modules/delivery/auth/auth.routes"),
    require.resolve("../src/modules/delivery"),
  ];
  for (const modPath of pathsToReload) {
    delete require.cache[modPath];
  }

  const freshAuthService = require("../src/modules/delivery/auth/auth.service");
  const { createDeliveryModule: createFreshDeliveryModule } = require("../src/modules/delivery");

  const dbBoot2 = createPersistentLoginDb({
    users: structuredClone(serializedSnapshots.users),
    profiles: structuredClone(serializedSnapshots.profiles),
    loginAttempts: structuredClone(serializedSnapshots.loginAttempts),
  });
  harness = dbBoot2.installStubs();

  try {
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use("/api/delivery", createFreshDeliveryModule());

    // 1st attempt after restart is the 3rd overall -> immediately locks account!
    const resAfterRestart = await invokeApp(freshApp, {
      url: "/api/delivery/auth/login",
      remoteAddress: "10.0.0.6",
      body: { email: "restart.rider@metkart.com", password: "Wrong3" },
    });
    assert.equal(resAfterRestart.status, 423);
    assert.equal(resAfterRestart.body.error.code, "ACCOUNT_LOCKED");

    // Reboot once more and confirm lockout still blocks valid password
    delete require.cache[require.resolve("../src/modules/delivery/auth/auth.service")];
    const rebootedAuthService = require("../src/modules/delivery/auth/auth.service");
    await assert.rejects(
      () => rebootedAuthService.loginRider({ email: "restart.rider@metkart.com", password: "ValidPass@123" }),
      (err) => err.code === "ACCOUNT_LOCKED" && err.httpStatus === 423
    );
  } finally {
    harness.restore();
    for (const modPath of pathsToReload) {
      delete require.cache[modPath];
    }
  }
});

// =========================================================================
// Scenario 10: Concurrent failed login requests cannot bypass limit
// =========================================================================
test("Scenario 10: concurrent failed login burst cannot bypass the 3-attempt cap or extend lock", async () => {
  const db = createPersistentLoginDb();
  const harness = db.installStubs({ simulateConcurrentUpsertRace: true });

  try {
    await seedRider(db, { email: "concurrent@metkart.com", password: "ValidPass@123" });

    // Fire 10 simultaneous wrong-password logins starting at 0 failures (including E11000 upsert race recovery)
    const fixedNow = new Date("2026-11-26T12:00:00.000Z");
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, idx) =>
        authService.loginRider({ email: "concurrent@metkart.com", password: `Wrong_${idx}` }, { now: fixedNow })
      )
    );

    const invalid401 = results.filter((r) => r.status === "rejected" && r.reason?.httpStatus === 401);
    const locked423 = results.filter((r) => r.status === "rejected" && r.reason?.httpStatus === 423);
    const unexpected = results.filter(
      (r) => r.status === "fulfilled" || (r.reason?.httpStatus !== 401 && r.reason?.httpStatus !== 423)
    );

    assert.equal(unexpected.length, 0);
    assert.equal(invalid401.length, 2);
    assert.equal(locked423.length, 8);
    assert.equal(db.loginAttempts[0].failedTimestamps.length, 3);
    assert.ok(db.loginAttempts[0].lockedUntil);

    // Verify correct password after burst is still locked
    await assert.rejects(
      () => authService.loginRider({ email: "concurrent@metkart.com", password: "ValidPass@123" }, { now: fixedNow }),
      (err) => err.code === "ACCOUNT_LOCKED" && err.httpStatus === 423
    );
  } finally {
    harness.restore();
  }
});

// =========================================================================
// Concurrency edge case: valid login racing with 3rd failed login
// =========================================================================
test("Concurrency edge case: valid login finishing after concurrent 3rd failure cannot clear lock or issue tokens", async () => {
  const db = createPersistentLoginDb();
  const harness = db.installStubs();

  try {
    await seedRider(db, { email: "race.clear@metkart.com", password: "ValidPass@123" });
    const t0 = new Date("2026-11-26T12:00:00.000Z");

    // Seed 2 failures first
    for (let i = 0; i < 2; i += 1) {
      await assert.rejects(
        () => authService.loginRider({ email: "race.clear@metkart.com", password: "Wrong" }, { now: t0 }),
        (err) => err.httpStatus === 401
      );
    }

    // Intercept RiderUser.findOne to trigger 3rd failure mid-flight during valid login
    const origFindOne = RiderUser.findOne;
    let triggered = false;
    RiderUser.findOne = (filter) => {
      const chain = origFindOne(filter);
      return {
        select(spec) {
          return chain.select(spec).then(async (userDoc) => {
            if (!triggered) {
              triggered = true;
              await assert.rejects(
                () => authService.loginRider({ email: "race.clear@metkart.com", password: "Wrong3" }, { now: t0 }),
                (err) => err.code === "ACCOUNT_LOCKED" && err.httpStatus === 423
              );
            }
            return userDoc;
          });
        },
      };
    };

    try {
      await assert.rejects(
        () => authService.loginRider({ email: "race.clear@metkart.com", password: "ValidPass@123" }, { now: t0 }),
        (err) => err.code === "ACCOUNT_LOCKED" && err.httpStatus === 423
      );
      assert.equal(db.refreshTokens.length, 0);
      assert.ok(db.loginAttempts[0].lockedUntil);
    } finally {
      RiderUser.findOne = origFindOne;
    }
  } finally {
    harness.restore();
  }
});

// =========================================================================
// Infrastructure error immunity & /api/v1/auth/login dual route delegation
// =========================================================================
test("Infrastructure error immunity & dual /api/v1/auth/login route delegation", async () => {
  const dbInfra = createPersistentLoginDb();
  const dbError = new Error("MongoNetworkTimeoutError: socket closed");
  const harnessInfra = dbInfra.installStubs({ userQueryError: dbError });

  try {
    await assert.rejects(
      () => authService.loginRider({ email: "infra@metkart.com", password: "Any" }),
      (err) => err === dbError
    );
    assert.equal(dbInfra.loginAttempts.length, 0);
  } finally {
    harnessInfra.restore();
  }

  // Test dual route /api/v1/auth/login falls through to rider lockout rules
  const dbRoute = createPersistentLoginDb();
  const harnessRoute = dbRoute.installStubs();
  const app = createTestExpressApp();
  const Account = require("../src/modules/accounts/account.model");
  const origAccountFindOne = Account.findOne;
  Account.findOne = () => ({ select: async () => null });

  try {
    await seedRider(dbRoute, { email: "dual.rider@metkart.com", password: "ValidPass@123" });

    const r1 = await invokeApp(app, {
      url: "/api/v1/auth/login",
      remoteAddress: "10.0.0.9",
      body: { email: "dual.rider@metkart.com", password: "Wrong" },
    });
    assert.equal(r1.status, 401);
    assert.equal(r1.body.error.details.remainingAttempts, 2);

    const r2 = await invokeApp(app, {
      url: "/api/v1/auth/login",
      remoteAddress: "10.0.0.9",
      body: { email: "dual.rider@metkart.com", password: "Wrong" },
    });
    assert.equal(r2.status, 401);
    assert.equal(r2.body.error.details.remainingAttempts, 1);

    const r3 = await invokeApp(app, {
      url: "/api/v1/auth/login",
      remoteAddress: "10.0.0.9",
      body: { email: "dual.rider@metkart.com", password: "Wrong" },
    });
    assert.equal(r3.status, 423);
    assert.equal(r3.body.error.code, "ACCOUNT_LOCKED");
  } finally {
    Account.findOne = origAccountFindOne;
    harnessRoute.restore();
  }
});
