const RECORD_CACHE_MS = 60000;
let cachedRecord = null;
let cachedAt = 0;
let pendingRead = null;

function databaseConfig() {
  const baseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!baseUrl || !serviceKey) throw new Error('A.L.I.S. requires the existing server-side Supabase connection.');
  return { baseUrl, serviceKey };
}

async function readAlisLicenseRecord(installationId) {
  if (cachedRecord && cachedRecord.installationId === installationId && Date.now() - cachedAt < RECORD_CACHE_MS) {
    return cachedRecord.record;
  }
  if (pendingRead) return pendingRead;

  pendingRead = (async () => {
    const { baseUrl, serviceKey } = databaseConfig();
    const endpoint = new URL('/rest/v1/alis_installation_licenses', baseUrl);
    endpoint.searchParams.set('select', 'license_key,validation_metadata');
    endpoint.searchParams.set('installation_id', 'eq.' + String(installationId));
    endpoint.searchParams.set('limit', '1');
    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: { apikey: serviceKey, authorization: 'Bearer ' + serviceKey, accept: 'application/json' }
    });
    if (!response.ok) throw new Error('A.L.I.S. license storage returned HTTP ' + response.status + '.');
    const rows = await response.json();
    const record = Array.isArray(rows) ? rows[0] || null : null;
    cachedRecord = { installationId, record };
    cachedAt = Date.now();
    return record;
  })();

  try {
    return await pendingRead;
  } finally {
    pendingRead = null;
  }
}

async function persistValidation(installationId, validation) {
  const { baseUrl, serviceKey } = databaseConfig();
  const endpoint = new URL('/rest/v1/alis_installation_licenses', baseUrl);
  endpoint.searchParams.set('installation_id', 'eq.' + String(installationId));
  const response = await fetch(endpoint, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      apikey: serviceKey,
      authorization: 'Bearer ' + serviceKey,
      'content-type': 'application/json',
      prefer: 'return=minimal'
    },
    body: JSON.stringify({
      validation_metadata: validation,
      license_status: 'valid',
      license_id: validation.license_id || null,
      authority: validation.authority || null,
      checked_at: new Date(Number(validation.checkedAt || Date.now())).toISOString(),
      expires_at: validation.expires_at || validation.expiry || validation.expiresAt || null,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error('A.L.I.S. validation cache could not be persisted (HTTP ' + response.status + ').');
  if (cachedRecord?.installationId === installationId && cachedRecord.record) {
    cachedRecord = { installationId, record: { ...cachedRecord.record, validation_metadata: validation } };
    cachedAt = Date.now();
  }
}

/**
 * Persist the already-validated ALIS payload in the existing server-only
 * installation record. This lets fresh Vercel function instances honour the
 * License Manager TTL/pulse policy without repeating authority discovery,
 * health and validation requests on every cold start.
 */
export function createAlisLicenseCacheStorage(installationId) {
  return Object.freeze({
    async get() {
      const record = await readAlisLicenseRecord(installationId);
      const validation = record?.validation_metadata;
      return validation && validation.valid === true ? validation : null;
    },
    async set(validation) {
      await persistValidation(installationId, validation);
    }
  });
}

export async function readAlisLicenseKey(installationId) {
  const record = await readAlisLicenseRecord(installationId);
  return record?.license_key || null;
}
