export interface ManualDeployAvailability {
  activated: boolean;
  configured: boolean;
  available: boolean;
}

export function isManualDeployAvailable(input?: {
  enabledFlag?: string | null;
  dispatchToken?: string | null;
}): ManualDeployAvailability;
