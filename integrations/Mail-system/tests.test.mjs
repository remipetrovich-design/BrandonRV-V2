import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderVariable, renderTemplate } from "./renderer.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFile(join(root, name), "utf8");

test("dotted variables interpolate and missing values become empty", () => {
  assert.equal(renderVariable("Hello {{user.name}} / {{missing}}", { user: { name: "Ada" } }), "Hello Ada / ");
});

test("subject and text render", () => {
  assert.deepEqual(
    renderTemplate({ subject: "Hi {{name}}", text: "{{count}} items" }, { name: "Ada", count: 2 }),
    { subject: "Hi Ada", text: "2 items", html: undefined },
  );
});

test("browser-facing components do not import or expose central API credentials", async () => {
  const [consoleSource, adminSource] = await Promise.all([read("console.tsx"), read("admin-ui.tsx")]);
  for (const source of [consoleSource, adminSource]) {
    assert.doesNotMatch(source, /MAIL_SYSTEM_API_KEY|MAIL_SYSTEM_URL|getMailModuleConfig|from ["']\.\/module/);
  }
});

test("server send path checks enablement, recipient addresses and API-key sender permissions", async () => {
  const source = await read("module.ts");
  assert.match(source, /if \(!settings\.enabled\)/);
  assert.match(source, /EMAIL_PATTERN\.test\(recipient\)/);
  assert.match(source, /capabilities\.senders\.some/);
  assert.match(source, /sendMessage\(/);
});

test("routing rejects unknown operators and evaluates supported conditional operators", async () => {
  const source = await read("routing.ts");
  for (const operator of ["equals", "notEquals", "in", "contains"]) assert.match(source, new RegExp(operator));
  assert.match(source, /operators\.some/);
  assert.match(source, /sort\(\(a, b\) => b\.priority - a\.priority\)/);
});

test("host persistence contract requires revision listing, restoration and atomic snapshots", async () => {
  const source = await read("types.ts");
  assert.match(source, /saveTemplate MUST update the template and/);
  assert.match(source, /insert its next revision snapshot in one database transaction/);
  assert.match(source, /listTemplateRevisions/);
  assert.match(source, /restoreTemplateRevision/);
});

test("host schema starts disabled and enables row-level security on every module table", async () => {
  const source = await read("schema.sql");
  assert.match(source, /'enabled', false/);
  for (const table of ["app_mail_templates", "app_mail_template_revisions", "app_mail_routes", "app_mail_triggers", "app_mail_settings"]) {
    assert.match(source, new RegExp("alter table " + table + " enable row level security", "i"));
  }
});

test("module documentation states the host and central service responsibility boundary", async () => {
  const [readme, install, api] = await Promise.all([read("README.md"), read("INSTALL.md"), read("API.md")]);
  assert.match(readme, /Mail System owns the Mail module source.*sending\/receiving infrastructure/i);
  assert.match(readme, /Brandon RV.*owns all Brandon RV business data and application configuration.*templates and revisions/i);
  assert.match(install, /server-only/i);
  assert.match(api, /trusted server-side host code/i);
});

test("connection verifier uses the production sender discovery contract and classifies failures", async () => {
  const source = await read("client.ts");
  assert.match(source, /\/api\/mail\/senders/);
  assert.match(source, /Authorization: "Bearer " \+ config\.apiKey/);
  for (const status of ["connected", "no_senders_assigned", "invalid_api_key", "external_system_or_scope_invalid", "configuration_missing", "mail_system_unavailable", "network_error"]) {
    assert.match(source, new RegExp(status));
  }
  assert.match(source, /\/api\/mail["']/);
});

test("host Supabase adapter persists every declared store capability", async () => {
  const source = await read("supabase-store.ts");
  for (const table of ["app_mail_templates", "app_mail_template_revisions", "app_mail_routes", "app_mail_triggers", "app_mail_settings"]) {
    assert.match(source, new RegExp(table));
  }
  assert.match(source, /app_mail_save_template_with_revision/);
  assert.match(source, /app_mail_restore_template_revision/);
});

test("package and manifest return to the requested v1 version", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const manifest = JSON.parse(await read("manifest.json"));
  assert.equal(pkg.version, "1.0.0");
  assert.equal(manifest.version, "1.0.0");
  assert.equal(pkg.private, false);
});


test("Brandon RV V2 manager manifest matches the installed integration contract", async () => {
  const manifest = JSON.parse(await read("integration.json"));
  const schema = JSON.parse(await read("../manifest.schema.json"));
  assert.equal(manifest.id, "mail-system");
  assert.equal(manifest.entrypoint, "server.cjs");
  assert.ok(manifest.events.includes("account.password_reset_requested"));
  assert.ok(manifest.events.includes("account.password_changed"));
  assert.ok(manifest.events.includes("staff.invitation_created"));
  assert.equal(schema.properties.entrypoint.const, "server.cjs");
  assert.ok(manifest.config.some(field => field.key === "apiKey" && field.type === "secret" && field.required));
});

test("manager server entrypoint exports the required lifecycle functions", async () => {
  const adapter = require("./server.cjs");
  assert.equal(typeof adapter.testConnection, "function");
  assert.equal(typeof adapter.handleEvent, "function");
});

test("manager connection test uses the encrypted secret and configured endpoint", async () => {
  const adapter = require("./server.cjs");
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 200, json: async () => ({ sender: "service@example.com", senders: [{ id: "1", address: "service@example.com" }] }) };
  };
  try {
    const result = await adapter.testConnection({
      endpoint: "https://mail.example.com",
      secrets: { apiKey: "test-secret" },
      settings: {}
    });
    assert.equal(result.ok, true);
    assert.match(result.message, /1 permitted sender/);
    assert.equal(request.url, "https://mail.example.com/api/mail/senders");
    assert.equal(request.init.headers.Authorization, "Bearer test-secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("manager event handler loads module configuration and sends the mapped template", async () => {
  const adapter = require("./server.cjs");
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lciylmfpcefdpsouoqvm.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-supabase-secret";
  let sentMessage;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "lciylmfpcefdpsouoqvm.supabase.co") {
      const table = url.pathname.split("/").pop();
      const rows = {
        app_mail_settings: [{ value: { enabled: true, defaultSender: "service@example.com" } }],
        app_mail_triggers: [{ event_key: "account.password_changed", template_key: "password-changed", route_key: null, recipient_mapping: { to: "user.email" }, active: true }],
        app_mail_templates: [{ template_key: "password-changed", subject: "Hello {{user.name}}", body_text: "Your password changed.", body_html: null, active: true }],
        app_mail_routes: []
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(rows[table] || []) };
    }
    if (url.pathname === "/api/mail/senders") {
      return { ok: true, status: 200, json: async () => ({ senders: [{ id: "1", address: "service@example.com" }] }) };
    }
    if (url.pathname === "/api/mail" && init.method === "POST") {
      sentMessage = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ ok: true, id: "message-1" }) };
    }
    throw new Error("Unexpected request: " + url.href);
  };
  try {
    const result = await adapter.handleEvent({
      event: "account.password_changed",
      payload: { user: { email: "recipient@example.com", name: "Ada" } }
    }, {
      endpoint: "https://mail.example.com",
      secrets: { apiKey: "test-mail-secret" },
      settings: {}
    });
    assert.equal(result.sent, true);
    assert.deepEqual(sentMessage.to, ["recipient@example.com"]);
    assert.equal(sentMessage.subject, "Hello Ada");
    assert.equal(sentMessage.from_address, "service@example.com");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});


test("Staff Portal exposes Mail System directly and permits configuration while its integration is disabled", async () => {
 const [layout,page]=await Promise.all([read("../../src/app/admin/layout.tsx"),read("../../src/app/admin/settings/mail-system/page.tsx")]);
 assert.match(layout,/label:"Mail System",href:"\\/admin\\/settings\\/mail-system"/);
 assert.doesNotMatch(page,/data\?\.active !== true/);
});

test("template editor is wired into the template form with rendered preview", async () => {
 const source=await read("console.tsx");
 assert.match(source,/MailHtmlEditor/);assert.match(source,/New template/);assert.match(source,/sandbox=""/);assert.match(source,/srcDoc=/);
});

test("rich HTML template editor includes formatting, colour, layout, image and HTML-source tools", async () => {
 const editor=await read("template-html-editor.tsx");
 for(const feature of ["bold","italic","underline","strikeThrough","insertUnorderedList","insertOrderedList","fontName","foreColor","hiliteColor","justifyFull","Upload image","Image URL","Email button","Table","Divider","HTML source"]) assert.ok(editor.includes(feature),feature);
 const assets=await read("../../src/app/api/admin/mail-system/assets/route.ts");
 assert.match(assets,/authorizePermission\("integrations\.manage"\)/);
 assert.match(assets,/mail-template-assets/);
 assert.match(assets,/MAX_BYTES=5\*1024\*1024/);
});
test("connection 403 diagnostic explains the strict send-only key contract", async () => {
 const source=await read("server.cjs");
 assert.match(source,/exactly one scope: mail:send/);
 assert.match(source,/Additional scopes such as mail:read/);
});
