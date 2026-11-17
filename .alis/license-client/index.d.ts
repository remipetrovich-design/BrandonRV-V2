export interface LicenseValidation {
  valid: boolean;
  code?: string;
  license_status?: string;
  status?: string;
  license_id?: string | null;
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
    action?: 'validate' | 'activate' | 'check_in';
  }): Promise<LicenseValidation>;
  enforce(input: Record<string, unknown>): Promise<LicenseValidation>;
  activate(input: Record<string, unknown>): Promise<LicenseValidation>;
  checkIn(input: Record<string, unknown>): Promise<LicenseValidation>;
}
export declare function createLicenseClient(options: {
  product: string;
  component: string;
  installationId: string;
  clientVersion?: string;
}): LicenseClient;
