import test from "node:test";
import assert from "node:assert/strict";
import {runCommand} from "../src/lib/stream-command.mjs";

test("Supabase CLI output is streamed and connection strings are redacted",async()=>{
 let output="";
 const secret="postgresql://admin:secret@db.example.com/postgres";
 const status=await runCommand(process.execPath,["-e",`process.stdout.write("migration started\\n");process.stderr.write("${secret}\\n");`],{redact:[secret],write:chunk=>{output+=chunk;}});
 assert.equal(status,0);
 assert.match(output,/migration started/);
 assert.match(output,/\[redacted\]/);
 assert.doesNotMatch(output,/admin:secret/);
});
test("Supabase CLI failure exit codes are preserved after streaming output",async()=>{
 const status=await runCommand(process.execPath,["-e","process.stderr.write('migration failed\\n');process.exit(7)"],{write:()=>{}});
 assert.equal(status,7);
});
