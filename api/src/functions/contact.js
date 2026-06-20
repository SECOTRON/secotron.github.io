const { app } = require("@azure/functions");
const { DefaultAzureCredential } = require("@azure/identity");
const { randomUUID } = require("crypto");

// Managed identity in Azure (no secrets). Locally falls back to `az login`.
const credential = new DefaultAzureCredential();
const GRAPH = "https://graph.microsoft.com/v1.0";

const MAIL_FROM = process.env.MAIL_FROM; // info@secotron.eu (the sending mailbox)
const MAIL_TO = process.env.MAIL_TO; // thomas.geens@secotron.eu (recipient)
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---- App Insights custom telemetry (events + metrics) -----------------------
// Stage logs go through context.log (host-native traces, reliable). This SDK
// adds queryable custom events/metrics for dashboards; we flush() per request
// because the Consumption worker can freeze before the SDK's batch ships.
let aiClient = null;
try {
  const cs = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (cs) {
    const appInsights = require("applicationinsights");
    appInsights
      .setup(cs)
      .setAutoCollectConsole(false)
      .setAutoCollectRequests(false)
      .setAutoCollectDependencies(true)
      .setSendLiveMetrics(true)
      .start();
    aiClient = appInsights.defaultClient;
    aiClient.context.tags[aiClient.context.keys.cloudRole] = "contact-api";
  }
} catch (_) {
  /* telemetry is best-effort; never block the request */
}

async function flushTelemetry() {
  try {
    if (aiClient && typeof aiClient.flush === "function") await aiClient.flush();
  } catch (_) {
    /* ignore */
  }
}

function trackOutcome(outcome, reason, durationMs, extra) {
  try {
    if (!aiClient) return;
    aiClient.trackEvent({
      name: "ContactProcessed",
      properties: { outcome, reason: reason || "", ...(extra || {}) },
      measurements: { durationMs },
    });
    aiClient.trackMetric({ name: "ContactDurationMs", value: durationMs });
  } catch (_) {
    /* ignore */
  }
}

// ---- Anti-spam helpers ------------------------------------------------------
const hits = new Map();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

function rateCount(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length;
}

function clean(v, max) {
  return String(v == null ? "" : v)
    .trim()
    .slice(0, max);
}

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

async function verifyTurnstile(token, ip) {
  if (!token) return { ok: false, codes: ["missing-input-response"], ms: 0 };
  const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  if (ip) body.append("remoteip", ip);
  const t = Date.now();
  const r = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  const j = await r.json().catch(() => ({}));
  return {
    ok: j.success === true,
    codes: j["error-codes"] || [],
    hostname: j.hostname,
    challengeTs: j.challenge_ts,
    ms: Date.now() - t,
  };
}

// ---- Handler ----------------------------------------------------------------
async function handler(request, context) {
  const t0 = Date.now();
  const dur = () => Date.now() - t0;
  const rid = randomUUID().slice(0, 8); // short correlation id per request
  const log = (msg, data) => context.log(`[${rid}] contact: ${msg}`, data || "");
  const warn = (msg, data) => context.warn(`[${rid}] contact: ${msg}`, data || "");
  const err = (msg, data) => context.error(`[${rid}] contact: ${msg}`, data || "");

  // Finish: log a single structured summary line + ship telemetry, then return.
  const finish = async (status, outcome, reason, extra) => {
    const durationMs = dur();
    log("done", { status, outcome, reason: reason || "", durationMs, ...(extra || {}) });
    trackOutcome(outcome, reason, durationMs, { requestId: rid, ...(extra || {}) });
    await flushTelemetry();
    const errBody = outcome === "sent" || reason === "honeypot" ? { ok: true } : { error: reason };
    return { status, jsonBody: errBody };
  };

  if (request.method === "OPTIONS") return { status: 204 };

  const h = request.headers;
  const origin = h.get("origin") || "";
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  log("received", {
    method: request.method,
    origin,
    ip,
    referer: h.get("referer") || "",
    userAgent: (h.get("user-agent") || "").slice(0, 200),
    contentLength: h.get("content-length") || "",
  });

  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    warn("forbidden_origin", { origin });
    return finish(403, "rejected", "forbidden_origin", { origin });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    warn("bad_request (json parse)");
    return finish(400, "rejected", "bad_request");
  }

  if (clean(data.botcheck, 16)) {
    warn("honeypot tripped", { ip });
    return finish(200, "rejected", "honeypot", { ip });
  }

  const count = rateCount(ip);
  log("rate check", { ip, countInWindow: count, max: RATE_MAX });
  if (count > RATE_MAX) {
    warn("rate_limited", { ip, countInWindow: count });
    return finish(429, "rejected", "rate_limited", { ip });
  }

  const turnstile = await verifyTurnstile(data["cf-turnstile-response"], ip).catch(
    (e) => {
      err("turnstile verify threw", { error: String(e) });
      return { ok: false, codes: ["verify-exception"], ms: 0 };
    },
  );
  log("turnstile", {
    ok: turnstile.ok,
    codes: turnstile.codes,
    hostname: turnstile.hostname,
    verifyMs: turnstile.ms,
  });
  if (!turnstile.ok) {
    warn("captcha_failed", { codes: turnstile.codes });
    return finish(400, "rejected", "captcha_failed", {
      codes: turnstile.codes.join(","),
    });
  }

  const name = clean(data.name, 120);
  const email = clean(data.email, 200);
  const company = clean(data.company, 160);
  const message = clean(data.message, 4000);
  log("validation", {
    nameLen: name.length,
    emailValid: isEmail(email),
    companyLen: company.length,
    messageLen: message.length,
  });
  if (!name || !message || !isEmail(email)) {
    warn("invalid_fields", {
      hasName: !!name,
      hasMessage: !!message,
      emailValid: isEmail(email),
    });
    return finish(422, "rejected", "invalid_fields");
  }

  let accessToken;
  try {
    const ts = Date.now();
    const tok = await credential.getToken("https://graph.microsoft.com/.default");
    accessToken = tok.token;
    log("graph token acquired", { acquireMs: Date.now() - ts });
  } catch (e) {
    err("token acquisition failed", { error: String(e) });
    return finish(500, "error", "auth_error");
  }

  const mail = {
    message: {
      subject: `New enquiry via secotron.eu — ${name}`,
      body: {
        contentType: "Text",
        content:
          `Name: ${name}\n` +
          `Email: ${email}\n` +
          `Company: ${company || "-"}\n` +
          `IP: ${ip}\n` +
          `Request: ${rid}\n\n` +
          message,
      },
      toRecipients: [{ emailAddress: { address: MAIL_TO } }],
      replyTo: [{ emailAddress: { address: email, name } }],
    },
    saveToSentItems: false,
  };

  log("graph sendMail begin", { from: MAIL_FROM, to: MAIL_TO });
  const gs = Date.now();
  const resp = await fetch(
    `${GRAPH}/users/${encodeURIComponent(MAIL_FROM)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mail),
    },
  );
  const graphMs = Date.now() - gs;
  const graphReqId =
    resp.headers.get("request-id") || resp.headers.get("x-ms-ags-diagnostic") || "";

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    err("graph sendMail failed", { status: resp.status, graphMs, graphReqId, detail });
    return finish(502, "error", "send_failed", {
      graphStatus: String(resp.status),
      graphMs: String(graphMs),
    });
  }

  log("graph sendMail ok", { status: resp.status, graphMs, graphReqId });
  return finish(200, "sent", "", { graphMs: String(graphMs) });
}

app.http("contact", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "contact",
  handler,
});
