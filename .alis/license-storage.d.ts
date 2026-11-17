import type { SupabaseClient } from '@supabase/supabase-js';
export declare function createAlisDatabase(): SupabaseClient;
export declare function readAlisLicenseKey(installationId: string): Promise<string | null>;
