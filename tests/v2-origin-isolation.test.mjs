import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("V2 account emails use the configured V2 app origin or the current request origin, never the V1 production host",async()=>{
 const paths=[
  "../src/app/api/auth/register/route.ts",
  "../src/app/api/auth/forgot-password/route.ts",
  "../src/app/api/staff/invitations/route.ts"
 ];
 for(const path of paths){
  const source=await read(path);
  assert.ok(source.includes("process.env.NEXT_PUBLIC_APP_URL"),"Configured V2 app origin must be supported.");
  assert.ok(source.includes("new URL(request.url).origin"),"Unconfigured V2 app origin must fall back to the current request origin.");
  assert.ok(!source.includes("https://brandon-rv.vercel.app"),"V2 must not send account links to the original production app.");
 }
});
