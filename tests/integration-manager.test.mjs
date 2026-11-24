import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("staff integrations page is present and permission protected",async()=>{
 const page=await read("src/app/admin/integrations/page.tsx"),layout=await read("src/app/admin/layout.tsx");
 assert.match(page,/integrations\.manage/);
 assert.match(layout,/\/admin\/integrations/);
 assert.match(layout,/Integrations/);
});
test("integration discovery scans child folders for manifests and ignores invalid modules",async()=>{
 const registry=await read("src/lib/integration-registry.ts");
 assert.match(registry,/readdir\(root/);
 assert.match(registry,/integration\.json/);
 assert.match(registry,/entry\.isDirectory\(\)/);
 assert.match(registry,/validId/);
});
test("integration API is permission checked, validates configuration and never returns secret values",async()=>{
 const api=await read("src/app/api/admin/integrations/route.ts");
 assert.match(api,/authorizePermission\("integrations\.manage"\)/);
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
test("no provider integration placeholders are installed",async()=>{
 await assert.rejects(access(new URL("../integrations/Mail-System",import.meta.url)));
 await assert.rejects(access(new URL("../integrations/Plugin2",import.meta.url)));
});
