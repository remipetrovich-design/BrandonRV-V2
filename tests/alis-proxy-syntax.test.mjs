import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

test("the ALIS proxy guard is valid JavaScript and can be parsed by Node",()=>{
 const proxyPath=fileURLToPath(new URL("../.alis/proxy-license.js",import.meta.url));
 const result=spawnSync(process.execPath,["--check",proxyPath],{encoding:"utf8"});
 assert.equal(result.status,0,[result.stdout,result.stderr].filter(Boolean).join("\n"));
});
