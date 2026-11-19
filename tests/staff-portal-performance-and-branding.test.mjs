import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Staff Portal auth resolves the session and user in one database round trip",async()=>{
 const source=await read("../src/lib/auth.ts");
 assert.match(source,/users!user_sessions_user_id_fkey/);
 assert.doesNotMatch(source,/\.from\("users"\)\.select\("id,email,full_name/);
});

test("API permission authorization checks membership and permissions concurrently",async()=>{
 const source=await read("../src/lib/auth.ts");
 const authorize=source.slice(source.indexOf("export async function authorizePermission"),source.indexOf("export async function destroySession"));
 assert.match(authorize,/Promise\.all\(\[currentMembership\(user\.id\),readEffectivePermissions\(user\.id\)\]\)/);
});

test("Staff Portal replaces legacy workspace names in shared navigation and customer entry point",async()=>{
 const shell=await read("../src/components/admin-shell.tsx");
 const portal=await read("../src/app/portal/layout.tsx");
 const loading=await read("../src/app/admin/loading.tsx");
 assert.match(shell,/STAFF PORTAL/);
 assert.match(shell,/Staff Portal/);
 assert.match(portal,/>Staff Portal<\/Link>/);
 assert.match(loading,/Loading Staff Portal/);
 assert.doesNotMatch(shell,/BUSINESS WORKSPACE|Business workspace/);
 assert.doesNotMatch(portal,/Business workspace/);
});

test("ALIS proxy reuses persisted validation metadata across cold serverless instances",async()=>{
 const storage=await read("../.alis/license-edge-storage.js");
 const proxy=await read("../.alis/proxy-license.js");
 assert.match(storage,/createAlisLicenseCacheStorage/);
 assert.match(storage,/validation_metadata/);
 assert.match(proxy,/storage:createAlisLicenseCacheStorage/);
});

test("first-install user count is briefly cached instead of queried on every protected navigation",async()=>{
 const proxy=await read("../src/proxy.ts");
 assert.match(proxy,/USER_COUNT_CACHE_MS/);
 assert.match(proxy,/readUserCount/);
});
