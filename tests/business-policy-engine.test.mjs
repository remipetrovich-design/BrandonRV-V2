import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BUSINESS_POLICIES,
  mergeBusinessPolicies,
  validateBusinessPolicies
} from "../src/lib/business-policy-engine.mjs";

test("unconfirmed commercial policies stay explicitly unconfigured",()=>{
  assert.equal(DEFAULT_BUSINESS_POLICIES.payment.deposit_policy,"not_configured");
  assert.equal(DEFAULT_BUSINESS_POLICIES.payment.parts_pre_payment,"not_configured");
  assert.equal(DEFAULT_BUSINESS_POLICIES.payment.parts_booking_policy,"not_configured");
  assert.equal(DEFAULT_BUSINESS_POLICIES.payment.payment_terms_days,null);
  assert.equal(DEFAULT_BUSINESS_POLICIES.payment.quote_validity_days,null);
});

test("saved business policies merge without erasing unrelated existing settings",()=>{
  const saved={payment:{deposit_policy:"percentage",deposit_value:25,deposit_due:"before_parts_order"},pricing:{gst_status:"registered",gst_rate:10},booking:{working_days:["mon"]}};
  const merged=mergeBusinessPolicies(saved);
  assert.equal(merged.payment.deposit_policy,"percentage");
  assert.equal(merged.payment.deposit_value,25);
  assert.equal(merged.pricing.gst_status,"registered");
  assert.deepEqual(merged.booking.working_days,["mon"]);
  assert.equal(merged.payment.parts_pre_payment,"not_configured");
});

test("deposit policies require a valid value only when fixed or percentage is selected",()=>{
  assert.equal(validateBusinessPolicies({deposit_policy:"not_configured",deposit_value:null}).valid,true);
  assert.equal(validateBusinessPolicies({deposit_policy:"none",deposit_value:null}).valid,true);
  assert.equal(validateBusinessPolicies({deposit_policy:"percentage",deposit_value:25}).valid,true);
  assert.equal(validateBusinessPolicies({deposit_policy:"fixed",deposit_value:150}).valid,true);
  assert.equal(validateBusinessPolicies({deposit_policy:"percentage",deposit_value:null}).valid,false);
  assert.equal(validateBusinessPolicies({deposit_policy:"percentage",deposit_value:101}).valid,false);
  assert.equal(validateBusinessPolicies({deposit_policy:"fixed",deposit_value:-1}).valid,false);
});

test("parts, booking and payment terms accept only supported configurable policies",()=>{
  assert.equal(validateBusinessPolicies({parts_pre_payment:"required",parts_booking_policy:"wait_until_received",payment_terms_days:14,quote_validity_days:30}).valid,true);
  assert.equal(validateBusinessPolicies({parts_pre_payment:"surprise",parts_booking_policy:"whenever",payment_terms_days:500,quote_validity_days:0}).valid,false);
});
