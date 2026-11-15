// Unit tests for the contact Function. No Azure, Cloudflare or Graph calls:
// the SDK modules and global fetch are stubbed. Run: cd api && npm test
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const FN = path.join(__dirname, "..", "src", "functions", "contact.js");

// ---- Stubs -----------------------------------------------------------------
let handler;
const stubs = {
  "@azure/functions": { app: { http: (_name, opts) => (handler = opts.handler) } },
  "@azure/identity": {
    DefaultAzureCredential: class {
      async getToken() {
        return { token: "test-token" };
      }
    },
  },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request in stubs) return stubs[request];
  return origLoad.call(this, request, ...rest);
};

const BASE_ENV = {
  MAIL_FROM: "info@example.test",
  MAIL_TO: "to@example.test",
  TURNSTILE_SECRET: "secret",
  ALLOWED_ORIGINS: "https://www.secotron.eu,http://localhost:4000",
  TURNSTILE_HOSTNAMES: "",
  APPLICATIONINSIGHTS_CONNECTION_STRING: "",
};

// Fresh module per call so env-derived constants and the rate map reset.
function load(env = {}) {
  Object.assign(process.env, BASE_ENV, env);
  delete require.cache[require.resolve(FN)];
  require(FN);
  return handler;
}

// fetch stub: Turnstile succeeds for token "good" and reports `tsHost`.
let tsHost;
let calls;
beforeEach(() => {
  tsHost = "www.secotron.eu";
  calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("turnstile")) {
      const ok = new URLSearchParams(String(opts.body)).get("response") === "good";
      return {
        json: async () => ({
          success: ok,
          hostname: tsHost,
          "error-codes": ok ? [] : ["invalid-input-response"],
        }),
      };
    }
    return { ok: true, status: 202, headers: new Map(), text: async () => "" };
  };
});

const ctx = { log() {}, warn() {}, error() {} };
const ORIGIN = { origin: "https://www.secotron.eu" };
const GOOD = { name: "A", email: "a@b.com", message: "hi", "cf-turnstile-response": "good" };
let ipSeq = 0;
const freshIp = () => `198.51.100.${++ipSeq}`;

function req(headers, body, method = "POST") {
  return {
    method,
    headers: new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    json: async () => {
      if (body === undefined) throw new SyntaxError("bad json");
      return body;
    },
  };
}
const remoteIp = () =>
  new URLSearchParams(String(calls.find((c) => c.url.includes("turnstile")).opts.body)).get(
    "remoteip",
  );

// ---- Tests -----------------------------------------------------------------
test("OPTIONS preflight returns 204", async () => {
  const h = load();
  assert.equal((await h(req(ORIGIN, null, "OPTIONS"), ctx)).status, 204);
});

test("rejects origins not in ALLOWED_ORIGINS", async () => {
  const h = load();
  const r = await h(req({ origin: "https://evil.example" }, GOOD), ctx);
  assert.equal(r.status, 403);
});

test("bad JSON returns 400", async () => {
  const h = load();
  const r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, undefined), ctx);
  assert.equal(r.status, 400);
});

test("honeypot answers 200 ok but sends nothing", async () => {
  const h = load();
  const r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, { ...GOOD, botcheck: "x" }), ctx);
  assert.deepEqual(r, { status: 200, jsonBody: { ok: true } });
  assert.equal(calls.length, 0);
});

test("valid submission sends mail via Graph", async () => {
  const h = load();
  const r = await h(req({ ...ORIGIN, "client-ip": "203.0.113.9:5555" }, GOOD), ctx);
  assert.deepEqual(r, { status: 200, jsonBody: { ok: true } });
  const send = calls.find((c) => c.url.includes("/sendMail"));
  assert.ok(send.url.includes(encodeURIComponent("info@example.test")));
  const mail = JSON.parse(send.opts.body);
  assert.match(mail.message.body.content, /IP: 203\.0\.113\.9\n/);
  assert.equal(mail.message.replyTo[0].emailAddress.address, "a@b.com");
});

test("invalid email returns 422", async () => {
  const h = load();
  const r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, { ...GOOD, email: "a@b" }), ctx);
  assert.equal(r.status, 422);
});

test("missing/invalid captcha returns 400", async () => {
  const h = load();
  const r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, { ...GOOD, "cf-turnstile-response": "nope" }), ctx);
  assert.deepEqual(r, { status: 400, jsonBody: { error: "captcha_failed" } });
});

test("rate limit cannot be bypassed by spoofing the first X-Forwarded-For entry", async () => {
  const h = load();
  const codes = [];
  for (let i = 1; i <= 6; i++) {
    // Client-controlled first entry changes; Azure-appended last entry has a varying port.
    const xff = `10.0.0.${i}, 192.0.2.77:${50000 + i}`;
    codes.push((await h(req({ ...ORIGIN, "x-forwarded-for": xff }, { name: "t" }), ctx)).status);
  }
  assert.deepEqual(codes, [400, 400, 400, 400, 400, 429]);
});

test("client IP: rightmost public XFF entry wins, then public platform headers", async () => {
  const h = load();
  const ip = async (headers) => {
    calls = [];
    await h(req({ ...ORIGIN, ...headers }, GOOD), ctx);
    return remoteIp();
  };
  // Azure Linux Consumption: CLIENT-IP is an internal front end (regression).
  assert.equal(await ip({ "client-ip": "10.0.32.24:5555", "x-forwarded-for": "192.0.2.3:61234" }), "192.0.2.3");
  // Spoofed left entry ignored; Azure-internal hop on the right skipped.
  assert.equal(await ip({ "x-forwarded-for": "6.6.6.6, 192.0.2.5:80, 10.0.32.24" }), "192.0.2.5");
  // No usable XFF → platform headers, private ones skipped.
  assert.equal(await ip({ "x-client-ip": "192.0.2.6", "client-ip": "192.0.2.7:1" }), "192.0.2.6");
  assert.equal(await ip({ "client-ip": "10.0.32.24:1", "x-azure-clientip": "192.0.2.8" }), "192.0.2.8");
  assert.equal(await ip({ "client-ip": "192.0.2.4:443" }), "192.0.2.4");
  // Only private addresses → still return one (rate limiting needs a key).
  assert.equal(await ip({ "client-ip": "10.0.32.24:1" }), "10.0.32.24");
  assert.equal(await ip({ "x-forwarded-for": "172.16.0.1, 100.64.1.1, ::ffff:192.168.1.1" }), "::ffff:192.168.1.1");
});

test("client IP: IPv6 with and without port", async () => {
  const h = load();
  await h(req({ ...ORIGIN, "client-ip": "[2001:db8::1]:443" }, GOOD), ctx);
  assert.equal(remoteIp(), "2001:db8::1");
  calls = [];
  await h(req({ ...ORIGIN, "client-ip": "2001:db8::2" }, GOOD), ctx);
  assert.equal(remoteIp(), "2001:db8::2");
});

test("Turnstile hostname must match an allowed origin (case-insensitive)", async () => {
  const h = load();
  tsHost = "attacker.example";
  let r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, GOOD), ctx);
  assert.deepEqual(r, { status: 400, jsonBody: { error: "captcha_failed" } });
  assert.equal(calls.some((c) => c.url.includes("/sendMail")), false);

  tsHost = "WWW.SECOTRON.EU";
  r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, GOOD), ctx);
  assert.equal(r.status, 200);

  tsHost = "localhost";
  r = await h(req({ origin: "http://localhost:4000", "client-ip": freshIp() }, GOOD), ctx);
  assert.equal(r.status, 200);
});

test("TURNSTILE_HOSTNAMES overrides the derived list", async () => {
  const h = load({ TURNSTILE_HOSTNAMES: "example.com" });
  tsHost = "example.com";
  assert.equal((await h(req({ ...ORIGIN, "client-ip": freshIp() }, GOOD), ctx)).status, 200);
  tsHost = "www.secotron.eu";
  assert.equal((await h(req({ ...ORIGIN, "client-ip": freshIp() }, GOOD), ctx)).status, 400);
});

test("Graph failure returns 502", async () => {
  const h = load();
  const base = global.fetch;
  global.fetch = async (url, opts) =>
    url.includes("/sendMail")
      ? { ok: false, status: 403, headers: new Map(), text: async () => "denied" }
      : base(url, opts);
  const r = await h(req({ ...ORIGIN, "client-ip": freshIp() }, GOOD), ctx);
  assert.deepEqual(r, { status: 502, jsonBody: { error: "send_failed" } });
});
