export interface LicenseValidation {
  valid: boolean;
  code?: string;
  license_id?: string | null;
  license_status?: string;
  status?: string;
  authority?: string | null;
  checkedAt?: number;
  expires_at?: string | null;
  expiry?: string | null;
  expiresAt?: string | null;
  offlineGrace?: boolean;
  offlineGraceRemainingSeconds?: number;
  [key: string]: unknown;
}
export interface LicenseClient {
  detectAuthority(options?: { force?: boolean }): Promise<unknown>;
  validate(input: {
    licenseKey: string;
    productVersion?: string;
    telemetry?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<LicenseValidation>;
}
export declare function createLicenseClient(options: {
  product: string;
  component: string;
  installationId: string;
}): LicenseClient;
