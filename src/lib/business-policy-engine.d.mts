export interface BusinessPaymentPolicy {
  deposit_policy: "not_configured" | "none" | "fixed" | "percentage";
  deposit_value: number | null;
  deposit_due: "not_configured" | "before_parts_order" | "before_booking" | "before_work";
  parts_pre_payment: "not_configured" | "required" | "not_required";
  parts_booking_policy: "not_configured" | "wait_until_received" | "allow_booking_before_received";
  payment_terms_days: number | null;
  quote_validity_days: number | null;
}
export const DEFAULT_BUSINESS_POLICIES: {
  payment: BusinessPaymentPolicy;
  pricing: { freight_policy: string; consumables_policy: string };
};
export function mergeBusinessPolicies(savedSettings?: Record<string, unknown>): Record<string, any> & { payment: BusinessPaymentPolicy };
export function validateBusinessPolicies(input?: Partial<BusinessPaymentPolicy>): {
  valid: boolean;
  errors: string[];
  value: BusinessPaymentPolicy;
};
