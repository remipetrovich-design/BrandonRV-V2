import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Mail System owns its complete admin page and editor inside its integration folder",async()=>{
 const manifest=JSON.parse(await read("integrations/Mail-system/integration.json"));
 assert.equal(manifest.adminPage,"admin-page.tsx");
 const [page,editor,actions]=await Promise.all([
  read("integrations/Mail-system/admin-page.tsx"),
  read("integrations/Mail-system/template-html-editor.tsx"),
  read("integrations/Mail-system/actions.ts")
 ]);
 assert.match(page,/MailModuleConsole/);
 assert.match(actions,/createSupabaseMailModuleStore/);
 assert.match(editor,/contentEditable/);
 assert.match(editor,/HTML source/);
 assert.match(editor,/Upload image/);
 for(const feature of ["fontName","foreColor","hiliteColor","insertTable","Email button","Image URL","Resize image","Image centre","HTML source"])assert.ok(editor.includes(feature),feature);
 assert.match(actions,/"use server"/);
});

test("Mail System navigation is generated from enabled integration manifests only",async()=>{
 const layout=await read("src/app/admin/layout.tsx");
 assert.match(layout,/discoverIntegrations/);
 assert.match(layout,/app_integrations/);
 assert.match(layout,/active/);
 const manager=await read("src/components/admin-integrations.tsx");
 assert.match(manager,/router\.refresh\(\)/);
 assert.match(layout,/href:"\/admin\/integrations\/".*module\.id/);
 assert.doesNotMatch(layout,/href:"\/admin\/settings\/mail-system"/);
});

test("generic integration page refuses disabled modules and loads their declared page from integrations",async()=>{
 const page=await read("src/app/admin/integrations/[integrationId]/page.tsx");
 assert.match(page,/app_integrations/);
 assert.match(page,/active/);
 assert.match(page,/notFound/);
 assert.match(page,/manifest\.adminPage/);
 assert.match(page,/integrations\/\$\{/);
});

test("Mail System admin actions re-check permission and integration enabled state",async()=>{
 const actions=await read("integrations/Mail-system/actions.ts");
 assert.match(actions,/authorizePermission\("integrations\.manage"\)/);
 assert.match(actions,/app_integrations/);
 assert.match(actions,/eq\("active",true\)/);
 assert.match(actions,/createSupabaseMailModuleStore/);
 assert.match(actions,/mail-template-assets/);
});

test("manager-disabled Mail System is excluded from event dispatch",async()=>{
 const runtime=await read("src/lib/integration-runtime.ts");
 assert.match(runtime,/eq\("active",true\)/);
});
