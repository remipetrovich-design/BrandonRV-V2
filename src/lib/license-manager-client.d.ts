export type LicenseAuthorityMode = "main" | "fallback";
export type LicenseAction = "validate" | "activate" | "check_in";
export type LicenseValidation = {
 valid: boolean;
 code?: string;
 product?: string;
 component?: string;
 installationId?: string;
 authority?: LicenseAuthorityMode;
 checkedAt?: number;
 pulseCheckedAt?: number;
 pulseRevision?: number;
 keyFingerprint?: string | null;
 runtime_policy?: Record<string,unknown>;
 runtimePolicy?: Record<string,unknown>;
 entitlements?: Record<string,unknown>;
 components?: Record<string,{allowed?:boolean}>;
 offlineGrace?: boolean;
 offlineGraceRemainingSeconds?: number;
 expires_at?: string;
 expiresAt?: string;
 [key:string]:unknown;
};
export type LicenseClientOptions = {
 product:string;
 component?:string;
 installationId:string;
 fetch?:typeof fetch;
 timeoutMs?:number;
 clientVersion?:string;
 storage?:{get?:(key:string)=>Promise<LicenseValidation|null>;set?:(key:string,value:LicenseValidation)=>Promise<void>};
};
export class LicenseError extends Error {
 name:"LicenseError";
 code:string;
 status:number;
 details:unknown;
 constructor(message:string,options?:{code?:string;status?:number;details?:unknown});
}
export const LICENSE_AUTHORITIES: Readonly<Record<LicenseAuthorityMode,string>>;
export function createLicenseClient(options:LicenseClientOptions):{
 readonly product:string;
 readonly component:string;
 readonly installationId:string;
 detectAuthority(options?:{force?:boolean}):Promise<{mode:LicenseAuthorityMode;baseUrl:string;revision:string|null;checkedAt:number;health:unknown}>;
 validate(input:{licenseKey:string;action?:LicenseAction;productVersion?:string;metadata?:Record<string,unknown>;telemetry?:Record<string,unknown>}):Promise<LicenseValidation>;
 enforce(input:{licenseKey:string;action?:LicenseAction;productVersion?:string;metadata?:Record<string,unknown>;telemetry?:Record<string,unknown>}):Promise<LicenseValidation>;
 activate(input:{licenseKey:string;productVersion?:string;metadata?:Record<string,unknown>;telemetry?:Record<string,unknown>}):Promise<LicenseValidation>;
 checkIn(input:{licenseKey:string;productVersion?:string;metadata?:Record<string,unknown>;telemetry?:Record<string,unknown>}):Promise<LicenseValidation>;
};
