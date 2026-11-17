export interface AlisConfiguration {
  productSlug: string;
  componentSlug: string;
  installationId: string;
  moduleVersion: string;
  productVersion: string;
  website: {
    name: string;
    repository: string;
    branch: string;
    commit: string;
    framework: string;
    productVersion: string;
    [key: string]: unknown;
  };
  licenseManagementPath: string;
  database: string;
  licenseStorageTable: string;
  permissionSystem: Record<string, unknown>;
  authority: string;
}
export declare const alisConfig: Readonly<AlisConfiguration>;
