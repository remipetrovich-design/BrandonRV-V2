export async function readAlisLicenseKey(installationId) {
  const baseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!baseUrl || !serviceKey) throw new Error('A.L.I.S. requires the existing server-side Supabase connection.');
  const endpoint = new URL('/rest/v1/alis_installation_licenses', baseUrl);
  endpoint.searchParams.set('select', 'license_key');
  endpoint.searchParams.set('installation_id', 'eq.' + String(installationId));
  endpoint.searchParams.set('limit', '1');
  const response = await fetch(endpoint, {
    method: 'GET', cache: 'no-store',
    headers: { apikey: serviceKey, authorization: 'Bearer ' + serviceKey, accept: 'application/json' }
  });
  if (!response.ok) throw new Error('A.L.I.S. license storage returned HTTP ' + response.status + '.');
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0]?.license_key || null : null;
}
