"use strict";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_EMAIL_LAYOUT = { html: "<table role=\"presentation\" width=\"100%\" class=\"email-wrapper\"><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\" class=\"email-container\"><tr><td class=\"header\"><img src=\"{{logoUrl}}\" alt=\"Brandon RV\" class=\"logo\"></td></tr><tr><td class=\"header-divider\"></td></tr><tr><td class=\"content\">{{content}}</td></tr><tr><td class=\"footer\"><table role=\"presentation\" width=\"100%\" class=\"footer-columns\"><tr><td class=\"footer-column\"><h3 class=\"footer-heading\">Information</h3><p class=\"footer-text\">Brandon RV</p><p class=\"footer-text\">Tamworth, NSW</p></td><td class=\"footer-column\"><h3 class=\"footer-heading\">About Us</h3><p class=\"footer-text\">From Factory Experience to Repairs On The Go</p></td><td class=\"footer-column\"><h3 class=\"footer-heading\">Contact</h3><p class=\"footer-text\"><a href=\"tel:0437985190\">0437 985 190</a></p><p class=\"footer-text\"><a href=\"mailto:brandon@brandonrv.trade\">brandon@brandonrv.trade</a></p></td></tr></table><div class=\"footer-bottom\"><p>Brandon RV | Tamworth, NSW</p><p>© Brandon RV. All rights reserved.</p></div></td></tr></table></td></tr></table>", css: "body{margin:0;padding:0;background-color:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#333}.email-wrapper{width:100%;padding:30px 12px;background:#f2f3f5}.email-container{width:100%;max-width:600px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden}.header{padding:30px 25px;text-align:center;background:#fff}.logo{display:block;width:100%;max-width:230px;height:auto;margin:0 auto;border:0}.header-divider{height:4px;background:#263746;line-height:4px;font-size:0}.content{padding:35px 30px;background:#fff;font-size:15px;line-height:1.7;color:#333}.footer{padding:30px 25px 20px;background:#263746;color:#fff}.footer-columns{width:100%;border-collapse:collapse}.footer-column{width:33.33%;padding:0 10px;vertical-align:top}.footer-heading{margin:0 0 12px;font-size:14px;font-weight:bold;color:#fff}.footer-text{margin:0 0 8px;font-size:12px;line-height:1.6;color:#d9e0e5}.footer a{color:#d9e0e5;text-decoration:none}.footer-bottom{margin-top:24px;padding-top:18px;border-top:1px solid #52616d;text-align:center}.footer-bottom p{margin:0 0 6px;font-size:11px;line-height:1.6;color:#c5cdd3}@media screen and (max-width:480px){.email-wrapper{padding:15px 8px}.header{padding:25px 15px}.content{padding:25px 20px}.footer{padding:25px 20px 18px}.footer-column{display:block;width:100%;padding:0 0 20px}.footer-column:last-child{padding-bottom:0}}" };

function mailConfig(context) {
  const endpoint = String(context.endpoint || "").trim().replace(/\/+$/, "");
  const apiKey = String(context.secrets && context.secrets.apiKey || "").trim();
  if (!/^https:\/\//i.test(endpoint)) throw new Error("Set the Mail System HTTPS endpoint in the Integrations Manager.");
  if (!apiKey) throw new Error("Mail System API key is not configured.");
  return { endpoint, apiKey };
}

async function mailRequest(context, path, init = {}) {
  const config = mailConfig(context);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(config.endpoint + path, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + config.apiKey,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {})
      },
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body.error === "string" ? body.error : "Mail System request failed (" + response.status + ").";
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function supabaseConfig() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Brandon RV V2 Supabase server credentials are not configured.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "lciylmfpcefdpsouoqvm.supabase.co") {
    throw new Error("Mail System integration must use the dedicated Brandon RV V2 Supabase project.");
  }
  return { url, key };
}

async function dbRequest(table, query, method = "GET", body) {
  const { url, key } = supabaseConfig();
  const response = await fetch(url + "/rest/v1/" + table + (query ? "?" + query : ""), {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json", Prefer: "return=representation" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store"
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data && typeof data.message === "string" ? data.message : "Mail configuration database request failed (" + response.status + ").";
    throw new Error(message);
  }
  return data;
}

function one(rows) { return Array.isArray(rows) ? rows[0] || null : rows; }
function pathValue(source, path) {
  if (typeof path !== "string" || !path.trim()) return undefined;
  return path.trim().split(".").reduce((value, key) => value == null ? undefined : value[key], source);
}
function render(value, context) {
  if (value == null) return "";
  return String(value).replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const result = pathValue(context, key);
    return result == null ? "" : String(result);
  });
}
function composeEmailHtml(content, layout, context) {
  const selected = layout && typeof layout.html === "string" && typeof layout.css === "string" ? layout : DEFAULT_EMAIL_LAYOUT;
  const shell = selected.html.includes("{{content}}") ? selected.html : selected.html + "{{content}}";
  const body = shell.replace(/{{\s*content\s*}}/g, content);
  return '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>' + render(selected.css, context) + '</style></head><body>' + render(body, context) + '</body></html>';
}
function conditionMatches(conditions, context) {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return false;
  return Object.entries(conditions).every(([path, expected]) => {
    const actual = pathValue(context, path);
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const operators = Object.keys(expected);
      if (!operators.length || operators.some(op => !["equals", "notEquals", "in", "contains"].includes(op))) return false;
      return operators.every(op => {
        const value = expected[op];
        if (op === "equals") return actual === value;
        if (op === "notEquals") return actual !== value;
        if (op === "in") return Array.isArray(value) && value.includes(actual);
        if (op === "contains") return Array.isArray(actual) ? actual.includes(value) : typeof actual === "string" && actual.includes(String(value));
        return false;
      });
    }
    return actual === expected;
  });
}
function resolveRecipients(mapping, payload) {
  const path = mapping && (mapping.to || mapping.recipients);
  const paths = Array.isArray(path) ? path : typeof path === "string" ? [path] : [];
  const recipients = paths.flatMap(item => {
    const value = pathValue(payload, item);
    return Array.isArray(value) ? value : value == null ? [] : [value];
  }).map(value => String(value).trim()).filter(Boolean);
  if (!recipients.length || recipients.some(value => !EMAIL.test(value))) {
    throw new Error("The event recipient mapping must resolve to one or more valid email addresses. Use {\"to\":\"path.to.email\"} or an array of payload paths.");
  }
  return [...new Set(recipients)];
}

async function testConnection(context) {
  try {
    const result = await mailRequest(context, "/api/mail/senders");
    const senders = Array.isArray(result.senders) ? result.senders.filter(item => item && typeof item.address === "string" && EMAIL.test(item.address)) : [];
    if (!senders.length) return { ok: false, senders: [], message: "Mail System accepted the API key, but no active sender mailbox on an active sender domain is assigned to this External System." };
    return { ok: true, senders, message: "Connected. " + senders.length + " permitted sender mailbox(es) available." };
  } catch (error) {
    if (error && error.statusCode === 401) return { ok: false, senders: [], message: "Mail System returned HTTP 401: " + (error.message || "The API key was not accepted. Check revocation and that the saved key is the current External System key.") };
    if (error && error.statusCode === 403) return { ok: false, senders: [], message: "Mail System returned HTTP 403 from GET /api/mail/senders: " + (error.message || "Request forbidden.") + " The endpoint verifies that this key is linked to an External System, that External System is active, and that the key has either the mail:send scope or the privileged mail:admin scope. It also returns no senders unless active mailboxes and sender domains are assigned." };
    return { ok: false, senders: [], message: error instanceof Error ? error.message : "Mail System connection failed." };
  }
}

async function handleEvent(input, context) {
  const event = input && input.event;
  const payload = input && input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? input.payload : {};
  const settingRows = await dbRequest("app_mail_settings", "select=value&key=eq.module&limit=1");
  const settings = one(settingRows)?.value || {};
  if (!settings.enabled) return { skipped: true, reason: "Mail System module is disabled in its own settings." };

  const triggerRows = await dbRequest("app_mail_triggers", "select=*&event_key=eq." + encodeURIComponent(String(event)) + "&active=eq.true&limit=1");
  const trigger = one(triggerRows);
  if (!trigger) return { skipped: true, reason: "No active trigger is configured for this event." };

  const templateRows = await dbRequest("app_mail_templates", "select=*&template_key=eq." + encodeURIComponent(trigger.template_key) + "&active=eq.true&limit=1");
  const template = one(templateRows);
  if (!template) throw new Error("The configured email template is missing or inactive.");

  const recipientPayload = resolveRecipients(trigger.recipient_mapping || {}, payload);
  const routeRows = await dbRequest("app_mail_routes", "select=*&active=eq.true&order=priority.desc");
  const routes = Array.isArray(routeRows) ? routeRows : [];
  const candidates = trigger.route_key ? routes.filter(route => route.route_key === trigger.route_key) : routes;
  const route = candidates.find(item => conditionMatches(item.conditions || {}, payload));
  if (trigger.route_key && !route) throw new Error("The trigger sender route is inactive or its conditions did not match.");
  const sender = route ? route.sender_address : settings.defaultSender;
  if (!sender || !EMAIL.test(sender)) throw new Error("No valid sender is configured for this event.");

  const senderResult = await mailRequest(context, "/api/mail/senders");
  const allowed = Array.isArray(senderResult.senders) && senderResult.senders.some(item => item && String(item.address).toLowerCase() === String(sender).toLowerCase());
  if (!allowed) throw new Error("The selected sender is not assigned to this External System API key.");

  const message = {
    to: recipientPayload,
    subject: render(template.subject, payload),
    text: template.body_text == null ? undefined : render(template.body_text, payload),
    html: template.body_html == null ? undefined : composeEmailHtml(render(template.body_html, payload), settings.emailLayout || DEFAULT_EMAIL_LAYOUT, { ...payload, logoUrl: settings.appearance && settings.appearance.logoUrl || "https://www.brandonrv.trade/Blogo.jpg" }),
    from_address: sender
  };
  await mailRequest(context, "/api/mail", { method: "POST", headers: payload.eventId ? { "x-request-id": String(payload.eventId) } : undefined, body: JSON.stringify(message) });
  return { sent: true, event, sender, recipientCount: recipientPayload.length };
}

module.exports = { testConnection, handleEvent };
