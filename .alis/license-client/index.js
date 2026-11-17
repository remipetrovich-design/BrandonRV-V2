/** Portable, opt-in License Manager client. No V1 Base imports or side effects. */
export const LICENSE_AUTHORITIES = Object.freeze({
  // License Manager exposes one stable public API hostname in both source modes.
  // The active source is selected by /source-configuration, not by changing URLs.
  main: 'https://incendiarynetworks.cc/api/v1',
  fallback: 'https://incendiarynetworks.cc/api/v1'
});

export class LicenseError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LicenseError';
    this.code = options.code || 'LICENSE_ERROR';
    this.status = options.status || 403;
    this.details = options.details || null;
  }
}

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const policyOf = result => object(result && (result.runtime_policy || result.runtimePolicy));
const transient = error => {
  if (error.code === 'LICENSING_AUTHORITY_DISABLED' || error.code === 'SOURCE_MODE_STANDBY') return false;
  return !error.status || [408, 425, 429].includes(error.status) || error.status >= 500;
};
const fingerprintKey = async key => {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export function createLicenseClient(options = {}) {
  const fetcher = options.fetch || globalThis.fetch;
  if (typeof fetcher !== 'function') throw new TypeError('A Fetch-compatible implementation is required.');
  const product = String(options.product || '').trim().toLowerCase();
  const component = String(options.component ?? '').trim().toLowerCase() || product;
  const installationId = String(options.installationId || '').trim();
  if (!product) throw new TypeError('A product identifier is required.');
  if (product.length > 80 || component.length > 80) throw new TypeError('Product and component identifiers must not exceed 80 characters.');
  if (!installationId) throw new TypeError('A stable installationId is required.');
  if (installationId.length > 256) throw new TypeError('installationId must not exceed 256 characters.');
  const requestedTimeout = Number(options.timeoutMs ?? 7000);
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(30000, Math.max(1000, requestedTimeout)) : 7000;
  const storage = options.storage || null;
  const cacheKey = 'license-manager-client:' + product + ':' + component + ':' + installationId;
  const sourceUrls = [...new Set(Object.values(LICENSE_AUTHORITIES))]
    .map(baseUrl => baseUrl + '/source-configuration');
  let currentAuthority = null;
  let lastValid = null;
  const supportedPulseActions = new Set(['full_recheck', 'revalidate_license', 'refresh_entitlements', 'refresh_binding', 'refresh_runtime_policy', 'refresh_authority', 'invalidate_cache', 'request_check_in', 'refresh_release_access']);

  async function request(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, {
        ...init,
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new LicenseError(body.error || body.code || ('License Manager HTTP ' + response.status), {
        code: body.code || 'LICENSE_MANAGER_HTTP_ERROR', status: response.status, details: body
      });
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  async function detectAuthority({ force = false } = {}) {
    if (!force && currentAuthority && Date.now() - currentAuthority.checkedAt < 5000) return currentAuthority;
    let lastError = null;
    for (const sourceUrl of sourceUrls) {
      let authoritativeConfigFound = false;
      try {
        const config = await request(sourceUrl);
        const mode = String(config.mode || '').toLowerCase();
        if (config.protocol !== 1 || !['main', 'fallback'].includes(mode)) continue;
        const baseUrl = LICENSE_AUTHORITIES[mode];
        if (!config.active || config.active.licenseApi !== baseUrl) continue;
        authoritativeConfigFound = true;
        let health;
        try {
          health = await request(baseUrl + '/license/health');
        } catch (error) {
          throw new LicenseError('The configured active License Manager is unavailable.', {
            code: 'ACTIVE_AUTHORITY_UNAVAILABLE', status: 503, details: { mode, cause: error.code || error.message }
          });
        }
        if (health.ok !== true || health.service !== 'license-manager') {
          throw new LicenseError('The configured active License Manager is unhealthy.', {
            code: 'ACTIVE_AUTHORITY_UNAVAILABLE', status: 503, details: { mode, health }
          });
        }
        if (!health.capabilities || health.capabilities.license_validation !== true) {
          throw new LicenseError('Licensing is disabled on the active authority.', {
            code: 'LICENSING_AUTHORITY_DISABLED', status: 503, details: { mode, health }
          });
        }
        currentAuthority = { mode, baseUrl, revision: config.revision || null, checkedAt: Date.now(), health };
        return currentAuthority;
      } catch (error) {
        lastError = error;
        // Never promote the standby if authoritative config names an unhealthy manager.
        if (authoritativeConfigFound || error.code === 'ACTIVE_AUTHORITY_UNAVAILABLE' || error.code === 'LICENSING_AUTHORITY_DISABLED') throw error;
      }
    }
    throw new LicenseError('Could not determine the active License Manager.', {
      code: 'AUTHORITY_DISCOVERY_FAILED', status: 503,
      details: lastError ? { code: lastError.code || null, message: lastError.message } : null
    });
  }

  async function readCache() {
    if (storage && typeof storage.get === 'function') return (await storage.get(cacheKey)) || lastValid;
    return lastValid;
  }
  async function writeCache(value) {
    lastValid = value;
    if (storage && typeof storage.set === 'function') await storage.set(cacheKey, value);
  }

  async function acknowledgePulse(directive, cached, result, error, revision) {
    if (directive.requires_ack === false) return;
    const selected = await detectAuthority();
    const details = error && error.details ? object(error.details) : {};
    await request(selected.baseUrl + '/license/pulse', {
      method: 'POST',
      body: JSON.stringify({
        action: 'ack', pulse_id: directive.id, revision: directive.revision,
        license_id: cached.license_id || null, installation_id: installationId,
        product, component, client: 'alis', client_version: String(options.clientVersion || '1.0.1'),
        status: error && Number(error.status || 0) >= 500 ? 'failed' : 'applied',
        result_code: error ? error.code || 'PULSE_REVALIDATION_FAILED' : result && result.code || 'LICENSE_VALID',
        error: error && Number(error.status || 0) >= 500 ? error.message : null,
        resulting_license_state: result && result.license_status || details.license_status || null,
        resulting_revision: Number(policyOf(result || details).pulse_revision || revision || 0),
        details: { directive_action: directive.action }
      })
    });
  }

  async function pollPulses(cached) {
    const selected = await detectAuthority();
    const url = new URL(selected.baseUrl + '/license/pulse');
    url.searchParams.set('since_revision', String(Number(cached.pulseRevision ?? policyOf(cached).pulse_revision ?? 0)));
    if (cached.license_id) url.searchParams.set('license_id', String(cached.license_id));
    url.searchParams.set('installation_id', installationId);
    url.searchParams.set('product', product);
    url.searchParams.set('component', component);
    const pulse = await request(url.toString());
    if (pulse.protocol_version !== 2 || !pulse.authority || !pulse.runtime_policy || !Array.isArray(pulse.directives)) {
      throw new LicenseError('License Manager returned an invalid pulse response.', { code: 'PULSE_RESPONSE_INVALID', status: 503 });
    }
    if (pulse.authority.system_enabled !== true || pulse.authority.licensing_enabled !== true || pulse.authority.maintenance_mode === true) {
      throw new LicenseError('Licensing is disabled on the active authority.', { code: 'LICENSING_AUTHORITY_DISABLED', status: 503, details: pulse.authority });
    }
    if (!['main', 'fallback'].includes(String(pulse.source_mode || '').toLowerCase()) || pulse.source_connection?.license_api !== selected.baseUrl) {
      throw new LicenseError('License Manager returned an unknown source mode or API endpoint.', { code: 'PULSE_SOURCE_INVALID', status: 503 });
    }
    const directives = pulse.directives;
    for (const directive of directives) {
      if (!supportedPulseActions.has(String(directive.action || ''))) {
        throw new LicenseError('License Manager sent an unsupported pulse directive.', { code: 'PULSE_ACTION_UNSUPPORTED', status: 503, details: { action: directive.action } });
      }
    }
    const revision = Number(pulse.pulse_revision || 0);
    const modeChanged = String(pulse.source_mode).toLowerCase() !== String(cached.authority || '').toLowerCase();
    if (directives.length || modeChanged) return { requiresRevalidation: true, directives, pulse, revision };
    const refreshed = {
      ...cached,
      pulseCheckedAt: Date.now(),
      pulseRevision: revision,
      runtime_policy: { ...policyOf(cached), ...object(pulse.runtime_policy), pulse_revision: revision }
    };
    await writeCache(refreshed);
    return { requiresRevalidation: false, cached: refreshed };
  }

  async function validate(input = {}) {
    const key = String(input.licenseKey || '').trim();
    const action = input.action || 'validate';
    if (!key || key.length > 256) throw new LicenseError('A licence key is required.', { code: 'LICENSE_KEY_REQUIRED', status: 400 });
    if (!['validate', 'activate', 'check_in'].includes(action)) throw new LicenseError('Unsupported validation action.', { code: 'INVALID_ACTION', status: 400 });
    const keyFingerprint = await fingerprintKey(key);
    const payload = {
      license_key: key, product, component, installation_id: installationId,
      product_version: input.productVersion || null, action,
      metadata: object(input.metadata), telemetry: object(input.telemetry)
    };
    try {
      let selected = await detectAuthority({ force: true });
      let result;
      try {
        result = await request(selected.baseUrl + '/license/validate', { method: 'POST', body: JSON.stringify(payload) });
      } catch (error) {
        if (error.code !== 'SOURCE_MODE_STANDBY') throw error;
        selected = await detectAuthority({ force: true });
        result = await request(selected.baseUrl + '/license/validate', { method: 'POST', body: JSON.stringify(payload) });
      }
      const checkedAt = Date.now();
      const normalized = { ...result, checkedAt, pulseCheckedAt: checkedAt, pulseRevision: Number(policyOf(result).pulse_revision || 0), authority: selected.mode, installationId, product, keyFingerprint };
      if (result.valid !== true) throw new LicenseError(result.code || 'LICENSE_INVALID', {
        code: result.code || 'LICENSE_INVALID', status: 403, details: normalized
      });
      await writeCache(normalized);
      return normalized;
    } catch (error) {
      if (!transient(error)) throw error;
      const cached = await readCache();
      if (!cached || cached.valid !== true || !keyFingerprint || cached.keyFingerprint !== keyFingerprint) throw error;
      const policy = policyOf(cached);
      const allowed = policy.allow_offline_grace === true || policy.allowOfflineGrace === true;
      const grace = Number(policy.offline_grace_seconds || policy.offlineGraceSeconds || 0);
      const ttl = Number(policy.validation_ttl_seconds || policy.validationTtlSeconds || 0);
      const age = Math.max(0, (Date.now() - Number(cached.checkedAt || 0)) / 1000);
      const limit = ttl + grace;
      if (!allowed || grace <= 0 || age > limit) throw error;
      return { ...cached, offlineGrace: true, offlineGraceRemainingSeconds: Math.max(0, limit - age) };
    }
  }

  async function enforce(input = {}) {
    const key = String(input.licenseKey || '').trim();
    if (!key || input.action && input.action !== 'validate') return validate(input);
    const keyFingerprint = await fingerprintKey(key);
    const cached = await readCache();
    if (!cached || cached.valid !== true || !keyFingerprint || cached.keyFingerprint !== keyFingerprint) return validate(input);

    const policy = policyOf(cached);
    const age = Math.max(0, (Date.now() - Number(cached.checkedAt || 0)) / 1000);
    const ttl = Math.max(0, Number(policy.validation_ttl_seconds || policy.validationTtlSeconds || 0));
    const ttlExpired = ttl <= 0 || age >= ttl;

    const pulseInterval = Math.max(1, Number(policy.pulse_poll_seconds || 5400));
    const pulseAge = Math.max(0, (Date.now() - Number(cached.pulseCheckedAt ?? cached.checkedAt ?? 0)) / 1000);
    const pulseDue = pulseAge >= pulseInterval;

    // Process a due pulse before returning a cache entry whose TTL has expired.
    // When both intervals are equal (the default policy), this preserves
    // targeted pulse delivery and acknowledgement at the TTL boundary.
    if (!pulseDue && !ttlExpired) return cached;
    if (!pulseDue && ttlExpired) return validate(input);

    let pulseResult;
    try {
      pulseResult = await pollPulses(cached);
    } catch (error) {
      if (error.code === 'LICENSING_AUTHORITY_DISABLED' || error.code === 'PULSE_RESPONSE_INVALID' || error.code === 'PULSE_SOURCE_INVALID' || error.code === 'PULSE_ACTION_UNSUPPORTED') throw error;
      if (transient(error) && !ttlExpired && age < ttl) return cached;
      if (transient(error) && ttlExpired) return validate(input);
      throw error;
    }
    if (!pulseResult.requiresRevalidation) return ttlExpired ? validate(input) : pulseResult.cached;

    let refreshed;
    let validationError = null;
    try {
      refreshed = pulseResult.directives.some(item => item.action === 'request_check_in')
        ? await validate({ ...input, action: 'check_in' })
        : await validate(input);
      if (refreshed.offlineGrace) throw new LicenseError('A pulse requires live revalidation; offline grace cannot satisfy this directive.', { code: 'PULSE_REVALIDATION_UNAVAILABLE', status: 503 });
    } catch (error) {
      validationError = error;
    }
    for (const directive of pulseResult.directives) {
      try {
        await acknowledgePulse(directive, cached, refreshed, validationError, pulseResult.revision);
      } catch (ackError) {
        if (refreshed) {
          await writeCache({ ...refreshed, pulseRevision: Number(cached.pulseRevision ?? policyOf(cached).pulse_revision ?? 0), pulseCheckedAt: 0 });
        }
        throw new LicenseError('License Manager pulse acknowledgement failed; access is blocked until it can be recorded.', {
          code: 'PULSE_ACK_FAILED', status: 503, details: { cause: ackError.code || ackError.message, directive: directive.id }
        });
      }
    }
    if (validationError) throw validationError;
    if (pulseResult.pulse.source_mode !== refreshed.authority) throw new LicenseError('License Manager source mode changed during pulse revalidation.', { code: 'PULSE_SOURCE_CHANGED', status: 503 });
    return refreshed;
  }

  return Object.freeze({
    product, component, installationId, detectAuthority,
    validate, enforce,
    activate: input => validate({ ...input, action: 'activate' }),
    checkIn: input => validate({ ...input, action: 'check_in' })
  });
}
