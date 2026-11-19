import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("verified customer sessions do not re-enter the account-check screen on route changes",async()=>{
 const guard=await read("src/components/portal-auth-guard.tsx");
 assert.match(guard,/if\(verified\|\|ready\)return <>{children}<\/>/);
 assert.doesNotMatch(guard,/usePathname|readyPath!==pathname/);
});

test("Jobcard tabs load only the datasets needed by the active tab",async()=>{
 const page=await read("src/app/portal/jobcards/[id]/page.tsx");
 assert.match(page,/needsQuoteData=activeTab==="overview"\|\|activeTab==="quotes"\|\|activeTab==="work-progress"/);
 assert.match(page,/needsBookingData=activeTab==="overview"\|\|activeTab==="work-progress"/);
 assert.match(page,/needsRequestFiles=activeTab==="request"/);
 assert.match(page,/activeTab==="work-progress"&&jobIds\.length/);
 assert.match(page,/Promise\.all\(\(workPhotos\?\?\[\]\)\.map/);
});

test("admin layout resolves membership and permissions concurrently",async()=>{
 const layout=await read("src/app/admin/layout.tsx");
 assert.match(layout,/Promise\.all\(\[currentMembership\(user\.id\),userHasPermissions\(user\.id,permissionKeys\)\]\)/);
});
