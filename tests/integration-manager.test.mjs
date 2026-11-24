import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("staff integrations page is present and permission protected",async()=>{
 const page=await read("src/app/admin/integrations/page.tsx"),layout=await read("src/app/admin/layout.tsx");
 assert.match(page,/integrations\.manage/);
 assert.match(layout,/\/admin\/integrations/);
});
test("discovery requires a valid manifest and a server entry point inside each integration folder",async()=>{
 const registry=await read("src/lib/integration-registry.ts");
 assert.match(registry,/readdir\(root/);
 assert.match(registry,/integration\.json/);
 assert.match(registry,/entry\.isDirectory\(\)/);
 assert.match(registry,/raw\.entrypoint!==\"server\.cjs\"/);
 assert.match(registry,/server\.cjs/);
 assert.match(registry,/events/);
});
test("server runtime validates module contract and dispatches only declared events to enabled modules",async()=>{
 const runtime=await read("src/lib/integration-runtime.ts");
 assert.match(runtime,/createRequire/);
 assert.match(runtime,/testConnection/);
 assert.match(runtime,/handleEvent/);
 assert.match(runtime,/eq\(\"active\",true\)/);
 assert.match(runtime,/manifest\.events\.includes\(event\)/);
});
test("staff API is permission checked, validates configuration, tests connections and never returns secret values",async()=>{
 const api=await read("src/app/api/admin/integrations/route.ts");
 assert.match(api,/authorizePermission\(\"integrations\.manage\"\)/);
 assert.match(api,/testInstalledIntegration/);
 assert.match(api,/encryptIntegrationSecrets/);
 assert.match(api,/secretConfigured/);
 assert.doesNotMatch(api,/Response\.json\(\{[^}]*secrets[,}]/);
});
test("integration secret values are encrypted with authenticated encryption",async()=>{
 const secrets=await read("src/lib/integration-secrets.ts");
 assert.match(secrets,/aes-256-gcm/);
 assert.match(secrets,/getAuthTag/);
 assert.match(secrets,/INTEGRATIONS_ENCRYPTION_KEY/);
});
test("manifest schema and module contract are documented without installing provider placeholders",async()=>{
 const schema=JSON.parse(await read("integrations/manifest.schema.json"));
 assert.equal(schema.properties.entrypoint.const,"server.cjs");
 const docs=await read("integrations/README.md");
 assert.match(docs,/dispatchIntegrationEvent/);
 assert.match(docs,/openssl rand -base64 32/);
 await assert.rejects(access(new URL("../integrations/Mail-System",import.meta.url)));
 await assert.rejects(access(new URL("../integrations/Plugin2",import.meta.url)));
});
