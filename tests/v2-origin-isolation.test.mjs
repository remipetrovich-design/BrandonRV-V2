import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("staff invitation links use the configured V2 app origin or current request origin",async()=>{
 const source=await read("../src/app/api/staff/invitations/route.ts");
 assert.ok(source.includes("process.env.NEXT_PUBLIC_APP_URL"),"Configured V2 app origin must be supported.");
 assert.ok(source.includes("new URL(request.url).origin"),"Unconfigured V2 app origin must fall back to the current request origin.");
 assert.ok(!source.includes("https://brandon-rv.vercel.app"),"V2 must not create links to the original production app.");
});
