import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const manifest=JSON.parse(await read("integrations/Mail-system/integration.json"));

test("Mail System subscribes to all registered events without a copied fixed catalogue",()=>{
 assert.deepEqual(manifest.events,["*"]);
 assert.equal(manifest.providesEvents,undefined);
});
test("BrandonRV V2 registers descriptive metadata for its business events",async()=>{
 const source=await read("src/lib/integration-events.ts");
 assert.match(source,/CORE_INTEGRATION_EVENT_DEFINITIONS/);
 assert.match(source,/description:/);assert.match(source,/trigger:/);
 assert.match(source,/sourceId:/);assert.match(source,/sourceName:/);
 for(const name of ["account.password_reset_requested","quote.issued","booking.confirmed","job.completed","invoice.issued"])assert.ok(source.includes(name));
});
test("installed integrations can register events that are automatically discovered",async()=>{
 const [registry,schema,docs]=await Promise.all([read("src/lib/integration-registry.ts"),read("integrations/manifest.schema.json"),read("integrations/README.md")]);
 assert.match(registry,/providesEvents/);assert.match(registry,/discoverIntegrationEvents/);
 assert.match(schema,/providesEvents/);assert.match(docs,/providesEvents/);
});
test("Mail System menu displays live event names, descriptions, triggers and source systems",async()=>{
 const [consoleSource,client,route,adminPage]=await Promise.all([read("integrations/Mail-system/console.tsx"),read("src/components/admin-mail-system.tsx"),read("src/app/api/admin/mail-system/route.ts"),read("integrations/Mail-system/admin-page.tsx")]);
 assert.match(consoleSource,/sourceName/);assert.match(consoleSource,/description/);assert.match(consoleSource,/trigger/);
 assert.match(client,/listAvailableEvents/);assert.match(route,/discoverIntegrationEvents/);assert.match(adminPage,/discoverIntegrationEvents/);
 assert.doesNotMatch(client,/CORE_INTEGRATION_EVENT_NAMES/);assert.doesNotMatch(adminPage,/CORE_INTEGRATION_EVENT_NAMES/);
});
test("event dispatch accepts registered events and wildcard subscribers receive them",async()=>{
 const runtime=await read("src/lib/integration-runtime.ts");
 assert.match(runtime,/discoverIntegrationEvents/);assert.match(runtime,/manifest\.events\.includes\(event\)/);assert.match(runtime,/manifest\.events\.includes\("\*"\)/);
});
test("Mail System retains its existing secret-only integration configuration",()=>{
 assert.equal(manifest.config.length,1);assert.equal(manifest.config[0].key,"apiKey");assert.equal(manifest.config[0].type,"secret");assert.equal(manifest.config[0].required,true);
});
