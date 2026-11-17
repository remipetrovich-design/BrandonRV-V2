export type ServiceApprovalState =
  | "approved_for_launch"
  | "conditional"
  | "assessment_required"
  | "deferred"
  | "not_offered";

export declare function isServiceAvailableForQuoting(service: {
  approval_status?: ServiceApprovalState | string | null;
  is_active?: boolean | null;
} | null | undefined): boolean;
