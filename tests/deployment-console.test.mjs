import test from "node:test";
import assert from "node:assert/strict";
import {extractConsoleErrors,isWorkflowActive,tailConsoleOutput} from "../src/lib/deployment-console.mjs";
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
