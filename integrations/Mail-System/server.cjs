"use strict";

const VALID_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function connectionDetails(context) {
  const endpoint = String(context.endpoint || "").trim().replace(/\/+$/, "");
  const apiKey = String(context.secrets && context.secrets.API_KEY || "").trim();
  if (!endpoint || !apiKey) throw new Error("Mail System endpoint and External System API key are required.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Mail System endpoint must use HTTPS.");
  }
  return { endpoint, apiKey };
}

async function testConnection(context) {
  let details;
  try { details = connectionDetails(context); }
  catch (error) { return { ok: false, message: error.message }; }
  let response;
  try {
    response = await fetch(details.endpoint + "/api/mail/senders", {
      method: "GET",
      headers: { Authorization: "Bearer " + details.apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    return { ok: false, message: "Could not reach Mail System: " + (error && error.message || "network error") };
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "Mail System returned HTTP " + response.status + ".";
    return { ok: false, message: message.slice(0, 450) };
  }
  const senders = (Array.isArray(body.senders) ? body.senders : []).filter(item =>
    item && typeof item.id === "string" && typeof item.address === "string" &&
    VALID_ADDRESS.test(item.address.trim())
  ).map(item => ({ id: item.id, address: item.address.trim().toLowerCase() }));
  return {
    ok: true,
    message: senders.length
      ? "Connected and authorised. " + senders.length + " active sender mailbox(es) are available."
      : "Connected to Mail System, but no active sender mailboxes are available to this key.",
    senders
  };
}

async function handleEvent() {
  throw new Error("Mail System connection verification is installed. No Brandon RV business events are mapped to email delivery yet.");
}

module.exports = { testConnection, handleEvent };
