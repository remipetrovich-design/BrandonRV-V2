import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("staff integrations page is present and permission protected",async()=>{
 const page=await read("src/app/admin/integrations/page.tsx"),layout=await read("src/app/admin/layout.tsx");
 assert.match(page,/integrations\.manage/);
 assert.match(layout,/\/admin\/integrations/);
});

test("discovery requires a valid manifest and server entry point in each integration folder",async()=>{
 const registry=await read("src/lib/integration-registry.ts");
 assert.match(registry,/readdir\(root/);
 assert.match(registry,/integration\.json/);
 assert.match(registry,/entry\.isDirectory\(\)/);
 assert.match(registry,/raw\.entrypoint!==\"server\.cjs\"/);
 assert.match(registry,/server\.cjs/);
 assert.match(registry,/CORE_INTEGRATION_EVENT_DEFINITIONS/);
 assert.match(registry,/discoverIntegrationEvents/);
 assert.match(registry,/providesEvents/);
});

test("duplicate folders with the same integration id resolve to one canonical manager entry",async()=>{
 const registry=await read("src/lib/integration-registry.ts"),manager=await read("src/components/admin-integrations.tsx");
 assert.match(registry,/const found=new Map<string,IntegrationManifest>\(\)/);
 assert.match(registry,/const existing=found\.get\(id\)/);
 assert.match(registry,/found\.set\(id,candidate\)/);
 assert.ok(manager.includes("new Map((data.integrations ?? []).map"));
});

test("server runtime validates module contract and dispatches only declared events to enabled modules",async()=>{
 const runtime=await read("src/lib/integration-runtime.ts");
 assert.match(runtime,/createRequire/);
 assert.match(runtime,/testConnection/);
 assert.match(runtime,/validateInstalledIntegration/);
 assert.match(runtime,/handleEvent/);
 assert.match(runtime,/eq\(\"active\",true\)/);
 assert.match(runtime,/manifest\.events\.includes\(event\)/);
 assert.match(runtime,/manifest\.events\.includes\(\"\*\"\)/);
 assert.match(runtime,/discoverIntegrationEvents/);
});

test("sender discovery preserves usable mailbox choices and returns them to the manager",async()=>{
 const runtime=await read("src/lib/integration-runtime.ts"),api=await read("src/app/api/admin/integrations/route.ts"),manager=await read("src/components/admin-integrations.tsx");
 assert.match(runtime,/value\.id===undefined\|\|value\.id===null/);
 assert.match(runtime,/String\(value\.id\)/);
 assert.match(runtime,/const senders=Array\.isArray\(result\.senders\)/);
 assert.match(api,/senders:result\.senders/);
 assert.match(manager,/Permitted sender mailboxes/);
 const consoleSource=await read("integrations/Mail-system/console.tsx");
 assert.match(consoleSource,/void testConnection\(\)/);
 assert.match(consoleSource,/setSenders\(result\.senders \|\| \[\]\)/);
});

test("staff API is permission checked, validates configuration, tests connections and redacts secrets",async()=>{
 const api=await read("src/app/api/admin/integrations/route.ts");
 assert.match(api,/authorizePermission\(\"integrations\.manage\"\)/);
 assert.match(api,/testInstalledIntegration/);
 assert.match(api,/encryptIntegrationSecrets/);
 assert.match(api,/secretConfigured/);
 assert.match(api,/secret_fields/);
 assert.doesNotMatch(api,/secrets:\\s*secrets/);
});

test("integration secret values are encrypted with authenticated encryption",async()=>{
 const secrets=await read("src/lib/integration-secrets.ts");
 assert.match(secrets,/aes-256-gcm/);
 assert.match(secrets,/getAuthTag/);
 assert.match(secrets,/INTEGRATIONS_ENCRYPTION_KEY/);
});

test("manifest schema and module contract are documented without provider placeholders",async()=>{
 const schema=JSON.parse(await read("integrations/manifest.schema.json"));
 assert.equal(schema.properties.entrypoint.const,"server.cjs");
 assert.equal(schema.properties.events.items.pattern,"^\\*$|^[a-z0-9][a-z0-9._-]{0,99}$");
 const events=await read("src/lib/integration-events.ts");
 assert.match(events,/account\.password_reset_requested/);
 assert.match(events,/account\.password_changed/);
 assert.match(events,/quote\.issued/);
 const docs=await read("integrations/README.md");
 assert.match(docs,/dispatchIntegrationEvent/);
 assert.match(docs,/openssl rand -base64 32/);
 await assert.rejects(access(new URL("../integrations/Mail-System",import.meta.url)));
 await assert.rejects(access(new URL("../integrations/Plugin2",import.meta.url)));
});

test("integration registry validates optional module-owned admin page entrypoints and live event discovery",async()=>{
 const registry=await read("src/lib/integration-registry.ts"),manifest=JSON.parse(await read("integrations/Mail-system/integration.json")),schema=JSON.parse(await read("integrations/manifest.schema.json")),consoleSource=await read("integrations/Mail-system/console.tsx"),adminPage=await read("integrations/Mail-system/admin-page.tsx");
 assert.equal(manifest.adminPage,"admin-page.tsx");
 assert.equal(schema.properties.adminPage.const,"admin-page.tsx");
 assert.match(registry,/raw\.adminPage/);
 assert.match(registry,/admin-page\.tsx/);
 assert.match(consoleSource,/availableEvents\.map/);
 assert.match(consoleSource,/Select an available event/);
 assert.match(adminPage,/force-dynamic/);
});
