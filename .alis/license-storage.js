import { createClient } from '@supabase/supabase-js';
export function createAlisDatabase() {
  const url = process.env.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('A.L.I.S. requires the existing server-side Supabase connection.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function readAlisLicenseKey(installationId) {
  const db = createAlisDatabase();
  const { data, error } = await db.from('alis_installation_licenses').select('license_key').eq('installation_id', installationId).maybeSingle();
  if (error) throw error;
  return data?.license_key || null;
}
