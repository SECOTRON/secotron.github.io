// Tests the browser form script (assets/js/contact.js) with a minimal fake DOM.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "..", "assets", "js", "contact.js"),
  "utf8",
);

function setup(responses) {
  let submit;
  let resets = 0;
  const status = {
    textContent: "",
    className: "",
    classList: { add: (c) => (status.className += " " + c) },
  };
  const btn = { disabled: false };
  const form = {
    dataset: { endpoint: "https://api.test/contact", success: "SENT", error: "ERR" },
    addEventListener: (_type, fn) => (submit = fn),
    querySelector: () => btn,
    reset() {},
  };
  const sandbox = {
    document: { getElementById: (id) => (id === "contact-form" ? form : status) },
    FormData: class {
      entries() {
        return [["name", "A"]][Symbol.iterator]();
      }
    },
    window: { turnstile: { reset: () => resets++ } },
    fetch: async () => {
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return r;
    },
    Object,
    JSON,
  };
  vm.runInNewContext(SRC, sandbox);
  return {
    send: () => submit({ preventDefault() {} }),
    status,
    btn,
    resets: () => resets,
  };
}

test("Turnstile is reset after a failed submit, so a retry gets a fresh token", async () => {
  const f = setup([{ ok: false }, { ok: true }]);
  await f.send();
  assert.equal(f.status.textContent, "ERR");
  assert.equal(f.resets(), 1);
  assert.equal(f.btn.disabled, false);
  await f.send();
  assert.equal(f.status.textContent, "SENT");
  assert.equal(f.resets(), 2);
});

test("Turnstile is reset after a network error", async () => {
  const f = setup([new TypeError("offline")]);
  await f.send();
  assert.equal(f.status.textContent, "ERR");
  assert.equal(f.resets(), 1);
  assert.equal(f.btn.disabled, false);
});
