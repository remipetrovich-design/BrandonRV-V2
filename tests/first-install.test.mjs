import test from "node:test";
import assert from "node:assert/strict";
import {requiresFirstOwnerSetup,canCreateFirstOwner} from "../src/lib/first-install.mjs";

test("a database with no accounts requires first-owner setup",()=>{
 assert.equal(requiresFirstOwnerSetup(0),true);
 assert.equal(canCreateFirstOwner(0),true);
});

test("an installation with any account has completed first-owner setup",()=>{
 for(const count of [1,2,100]){
  assert.equal(requiresFirstOwnerSetup(count),false);
  assert.equal(canCreateFirstOwner(count),false);
 }
});

test("unknown account counts fail closed",()=>{
 for(const count of [null,undefined,-1,1.5,NaN]){
  assert.equal(requiresFirstOwnerSetup(count),false);
  assert.equal(canCreateFirstOwner(count),false);
 }
});

test("first-install routing distinguishes setup, existing accounts and unavailable state",async()=>{
 const {firstInstallDecision}=await import("../src/lib/first-install.mjs");
 assert.equal(firstInstallDecision(0,"/"),"setup");
 assert.equal(firstInstallDecision(0,"/setup"),"allow");
 assert.equal(firstInstallDecision(0,"/api/auth/bootstrap-owner"),"allow");
 assert.equal(firstInstallDecision(1,"/setup"),"sign-in");
 assert.equal(firstInstallDecision(1,"/portal/sign-in"),"allow");
 for(const count of [null,undefined,-1,1.5,NaN])assert.equal(firstInstallDecision(count,"/"),"unavailable");
});
