export const DEFAULT_BUSINESS_POLICIES = {
  payment: {
    deposit_policy: "not_configured",
    deposit_value: null,
    deposit_due: "not_configured",
    parts_pre_payment: "not_configured",
    parts_booking_policy: "not_configured",
    payment_terms_days: null,
    quote_validity_days: null
  },
  pricing: {
    freight_policy: "not_configured",
    consumables_policy: "not_configured"
  }
};

const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function mergeBusinessPolicies(savedSettings = {}) {
  const saved = object(savedSettings);
  return {
    ...saved,
    payment: { ...DEFAULT_BUSINESS_POLICIES.payment, ...object(saved.payment) },
    pricing: { ...object(saved.pricing), ...DEFAULT_BUSINESS_POLICIES.pricing, ...object(saved.pricing) }
  };
}

export function validateBusinessPolicies(input = {}) {
  const value = { ...DEFAULT_BUSINESS_POLICIES.payment, ...object(input) };
  const errors = [];
  const depositPolicy = String(value.deposit_policy);
  const depositDue = String(value.deposit_due);
  const prepayment = String(value.parts_pre_payment);
  const bookingPolicy = String(value.parts_booking_policy);

  if (!["not_configured", "none", "fixed", "percentage"].includes(depositPolicy)) {
    errors.push("Select a valid deposit policy.");
  }
  const depositValue = value.deposit_value === "" || value.deposit_value === undefined ? null : value.deposit_value === null ? null : Number(value.deposit_value);
  if (depositPolicy === "fixed" && (!Number.isFinite(depositValue) || depositValue <= 0 || depositValue > 10000000)) {
    errors.push("A fixed deposit must be greater than $0 and no more than $10,000,000.");
  }
  if (depositPolicy === "percentage" && (!Number.isFinite(depositValue) || depositValue <= 0 || depositValue > 100)) {
    errors.push("A deposit percentage must be greater than 0 and no more than 100.");
  }
  if (depositPolicy !== "fixed" && depositPolicy !== "percentage" && depositValue !== null) {
    errors.push("Remove the deposit amount unless a fixed or percentage deposit is selected.");
  }
  if (!["not_configured", "before_parts_order", "before_booking", "before_work"].includes(depositDue)) {
    errors.push("Select when the deposit is due.");
  }
  if (["fixed", "percentage"].includes(depositPolicy) && depositDue === "not_configured") {
    errors.push("Select when the deposit is due.");
  }
  if (!["not_configured", "required", "not_required"].includes(prepayment)) {
    errors.push("Select a valid parts prepayment policy.");
  }
  if (!["not_configured", "wait_until_received", "allow_booking_before_received"].includes(bookingPolicy)) {
    errors.push("Select a valid booking rule for parts.");
  }
  const terms = value.payment_terms_days === "" || value.payment_terms_days === undefined ? null : value.payment_terms_days === null ? null : Number(value.payment_terms_days);
  if (terms !== null && (!Number.isInteger(terms) || terms < 0 || terms > 90)) {
    errors.push("Payment terms must be between 0 and 90 days, or left unconfigured.");
  }
  const validity = value.quote_validity_days === "" || value.quote_validity_days === undefined ? null : value.quote_validity_days === null ? null : Number(value.quote_validity_days);
  if (validity !== null && (!Number.isInteger(validity) || validity < 1 || validity > 365)) {
    errors.push("Quote validity must be between 1 and 365 days, or left unconfigured.");
  }
  return {
    valid: errors.length === 0,
    errors,
    value: {
      deposit_policy: depositPolicy,
      deposit_value: depositValue,
      deposit_due: depositDue,
      parts_pre_payment: prepayment,
      parts_booking_policy: bookingPolicy,
      payment_terms_days: terms,
      quote_validity_days: validity
    }
  };
}
