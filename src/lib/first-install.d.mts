export declare function requiresFirstOwnerSetup(userCount: number | null | undefined): boolean;
export declare function canCreateFirstOwner(userCount: number | null | undefined): boolean;
export type FirstInstallDecision = "allow" | "setup" | "sign-in" | "unavailable";
export declare function firstInstallDecision(userCount: number | null | undefined, pathname: string): FirstInstallDecision;
