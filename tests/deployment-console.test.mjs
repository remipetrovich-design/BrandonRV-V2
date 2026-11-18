import test from "node:test";
import assert from "node:assert/strict";
import {extractConsoleErrors,extractZipText,isWorkflowActive,tailConsoleOutput} from "../src/lib/deployment-console.mjs";
test("workflow activity is limited to queued and running states",()=>{
 assert.equal(isWorkflowActive("queued"),true);assert.equal(isWorkflowActive("in_progress"),true);assert.equal(isWorkflowActive("waiting"),true);assert.equal(isWorkflowActive("completed"),false);assert.equal(isWorkflowActive(""),false);
});
test("console output is tailed, ANSI-cleaned and database connection strings are redacted",()=>{
 const value="\u001b[31mERROR: bad SQL\u001b[0m\npostgresql://admin:secret@db.example.com:5432/postgres\nlast line";
 const result=tailConsoleOutput(value);assert.match(result,/ERROR: bad SQL/);assert.match(result,/postgresql:\/\/\[redacted\]/);assert.doesNotMatch(result,/admin:secret/);
});
test("console output keeps only the requested final lines",()=>assert.equal(tailConsoleOutput("one\ntwo\nthree",2),"two\nthree"));
test("SQL and workflow failures are extracted for the error summary",()=>{
 const errors=extractConsoleErrors("step started\nERROR: relation missing\n::error::Migration failed\nstep done");assert.deepEqual(errors,["ERROR: relation missing","::error::Migration failed"]);
});

test("GitHub job-log ZIP archives are decoded into readable text",()=>{
 const name=Buffer.from("job.txt"),body=Buffer.from("ERROR: migration failed");
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);local.writeUInt16LE(0,8);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(0,42);
 const localPart=Buffer.concat([local,name,body]),centralPart=Buffer.concat([central,name]),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(centralPart.length,12);end.writeUInt32LE(localPart.length,16);
 const result=extractZipText(Buffer.concat([localPart,centralPart,end]));
 assert.match(result,/ERROR: migration failed/);assert.match(result,/job\.txt/);
});
