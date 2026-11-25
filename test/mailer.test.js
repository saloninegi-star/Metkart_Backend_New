const test = require("node:test");
const assert = require("node:assert/strict");
const mailer = require("../src/utils/mailer");

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "BREVO_API_KEY",
  "BREVO_SENDER_EMAIL",
  "BREVO_SENDER_NAME",
];

function snapshotEnv() {
  const saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
  }
  return saved;
}

function restoreEnv(saved) {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
}

test("mailer: sends via Nodemailer SMTP first without calling Brevo when SMTP succeeds", async () => {
  const savedEnv = snapshotEnv();
  const origSendMail = mailer.transporter.sendMail;
  const origFetch = global.fetch;

  let smtpCalled = 0;
  let fetchCalled = 0;

  try {
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Metkart <user@example.com>";
    process.env.BREVO_API_KEY = "xkeysib-test";

    mailer.transporter.sendMail = async (opts) => {
      smtpCalled += 1;
      assert.equal(opts.to, "rider@example.com");
      assert.ok(opts.html.includes("654321"));
      return { messageId: "smtp-msg-1" };
    };

    global.fetch = async () => {
      fetchCalled += 1;
      throw new Error("Brevo should not be called when SMTP succeeds");
    };

    const res = await mailer.sendOtpEmail("rider@example.com", "654321", "Rider");
    assert.deepEqual(res, { messageId: "smtp-msg-1" });
    assert.equal(smtpCalled, 1);
    assert.equal(fetchCalled, 0);
  } finally {
    mailer.transporter.sendMail = origSendMail;
    global.fetch = origFetch;
    restoreEnv(savedEnv);
  }
});

test("mailer: falls back to Brevo HTTPS API when Nodemailer SMTP fails", async () => {
  const savedEnv = snapshotEnv();
  const origSendMail = mailer.transporter.sendMail;
  const origFetch = global.fetch;

  let smtpCalled = 0;
  let fetchCalled = 0;

  try {
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "Metkart <user@example.com>";
    process.env.BREVO_API_KEY = "xkeysib-test-key";
    process.env.BREVO_SENDER_EMAIL = "lavi@pearlorganisation.com";
    process.env.BREVO_SENDER_NAME = "pearl organisation";

    mailer.transporter.sendMail = async () => {
      smtpCalled += 1;
      throw new Error("Connection timeout");
    };

    global.fetch = async (url, init) => {
      fetchCalled += 1;
      assert.equal(url, "https://api.brevo.com/v3/smtp/email");
      assert.equal(init.method, "POST");
      assert.equal(init.headers["api-key"], "xkeysib-test-key");

      const body = JSON.parse(init.body);
      assert.deepEqual(body.sender, {
        name: "pearl organisation",
        email: "lavi@pearlorganisation.com",
      });
      assert.deepEqual(body.to, [{ email: "rider@example.com", name: "Rider" }]);
      assert.ok(body.htmlContent.includes("112233"));

      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: "<brevo-msg-1>" }),
      };
    };

    const res = await mailer.sendOtpEmail("rider@example.com", "112233", "Rider");
    assert.deepEqual(res, { messageId: "<brevo-msg-1>" });
    assert.equal(smtpCalled, 1);
    assert.equal(fetchCalled, 1);
  } finally {
    mailer.transporter.sendMail = origSendMail;
    global.fetch = origFetch;
    restoreEnv(savedEnv);
  }
});

test("mailer: rethrows SMTP error when BREVO_API_KEY is not configured", async () => {
  const savedEnv = snapshotEnv();
  const origSendMail = mailer.transporter.sendMail;

  try {
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";
    delete process.env.BREVO_API_KEY;

    mailer.transporter.sendMail = async () => {
      throw new Error("SMTP blocked");
    };

    await assert.rejects(
      () => mailer.sendOtpEmail("rider@example.com", "999999", "Rider"),
      /SMTP blocked/
    );
  } finally {
    mailer.transporter.sendMail = origSendMail;
    restoreEnv(savedEnv);
  }
});

test("mailer: uses Brevo HTTPS API directly when SMTP credentials are absent", async () => {
  const savedEnv = snapshotEnv();
  const origFetch = global.fetch;

  let fetchCalled = 0;

  try {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.SMTP_FROM = "pearl organisation <lavi@pearlorganisation.com>";
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;
    process.env.BREVO_API_KEY = "xkeysib-only";

    global.fetch = async (url, init) => {
      fetchCalled += 1;
      const body = JSON.parse(init.body);
      assert.deepEqual(body.sender, {
        name: "pearl organisation",
        email: "lavi@pearlorganisation.com",
      });
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: "<brevo-only-1>" }),
      };
    };

    const res = await mailer.sendOtpEmail("user@example.com", "777888", "Alex");
    assert.deepEqual(res, { messageId: "<brevo-only-1>" });
    assert.equal(fetchCalled, 1);
  } finally {
    global.fetch = origFetch;
    restoreEnv(savedEnv);
  }
});
