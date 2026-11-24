"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { testConnection } = require("./server.cjs");

const context = {
  endpoint: "https://mail.example.test",
  secrets: { API_KEY: "test-key" }
};

test("Mail System connection accepts an authorised sender list", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://mail.example.test/api/mail/senders");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    return new Response(JSON.stringify({
      sender: "service@example.test",
      senders: [{ id: "mailbox-1", address: "service@example.test" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await testConnection(context);
    assert.equal(result.ok, true);
    assert.equal(result.senders.length, 1);
    assert.equal(result.senders[0].address, "service@example.test");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Mail System connection surfaces rejected external-system permissions", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    error: "An active external-system key with mail:send or mail:admin permission is required."
  }), { status: 403, headers: { "Content-Type": "application/json" } });
  try {
    const result = await testConnection(context);
    assert.equal(result.ok, false);
    assert.match(result.message, /mail:send or mail:admin/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Mail System endpoint rejects non-HTTPS remote endpoints", async () => {
  const result = await testConnection({ endpoint: "http://mail.example.test", secrets: { API_KEY: "test-key" } });
  assert.equal(result.ok, false);
  assert.match(result.message, /HTTPS/);
});
