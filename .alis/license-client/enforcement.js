import { LicenseError } from './index.js';

export function requireFeature(validation, feature) {
  if (!validation || validation.valid !== true) throw new LicenseError('An active licence is required.', { code: 'LICENSE_REQUIRED', status: 403 });
  const components = validation.components && typeof validation.components === 'object' ? validation.components : {};
  const entitlements = validation.entitlements && typeof validation.entitlements === 'object' ? validation.entitlements : {};
  if (components[feature] && components[feature].allowed === true) return true;
  if (entitlements[feature] === true || (entitlements[feature] && entitlements[feature].allowed === true)) return true;
  if (feature === validation.component || feature === validation.product) return true;
  throw new LicenseError('This licence does not include feature: ' + feature, {
    code: 'FEATURE_NOT_ENTITLED', status: 403, details: { feature }
  });
}

export function withLicense(client, handler, options = {}) {
  if (!client || typeof client.enforce !== 'function') throw new TypeError('A license client is required.');
  if (typeof handler !== 'function') throw new TypeError('A handler function is required.');
  return async function licensedHandler(context) {
    const input = typeof options.getLicenseInput === 'function'
      ? await options.getLicenseInput(context)
      : context && context.license;
    const validation = await client.enforce(input || {});
    if (options.feature) requireFeature(validation, options.feature);
    return handler(context, validation);
  };
}

export function licenseMiddleware(client, options = {}) {
  return async function licenseManagerMiddleware(req, res, next) {
    try {
      const input = typeof options.getLicenseInput === 'function'
        ? await options.getLicenseInput(req)
        : req && req.body && req.body.license;
      const validation = await client.enforce(input || {});
      if (options.feature) requireFeature(validation, options.feature);
      req.license = validation;
      return next();
    } catch (error) {
      const status = Number(error.status || 403);
      return res.status(status).json({
        valid: false,
        code: error.code || 'LICENSE_REQUIRED',
        error: error.message || 'Licence enforcement failed'
      });
    }
  };
}

/** Evaluate a Fetch Request at a trusted server/edge boundary. */
export function createFetchGate(client, options = {}) {
  if (!client || typeof client.enforce !== 'function') throw new TypeError('A license client is required.');
  return async function evaluateLicenseRequest(request) {
    try {
      const input = typeof options.getLicenseInput === 'function'
        ? await options.getLicenseInput(request)
        : request && request.license;
      const validation = await client.enforce(input || {});
      if (options.feature) requireFeature(validation, options.feature);
      return { allowed: true, status: 200, code: validation.code || 'LICENSE_VALID', validation };
    } catch (error) {
      const candidateStatus = Number(error && error.status);
      return {
        allowed: false,
        status: Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 403,
        code: error && error.code ? String(error.code) : 'LICENSE_REQUIRED',
        error: error && error.message ? String(error.message) : 'Licence enforcement failed'
      };
    }
  };
}

/** Block a Fetch Request before it reaches the protected route handler. */
export function createFetchMiddleware(client, options = {}) {
  const evaluate = createFetchGate(client, options);
  return async function licenseFetchMiddleware(request, next) {
    if (typeof next !== 'function') throw new TypeError('A next request handler is required.');
    const result = await evaluate(request);
    if (!result.allowed) {
      const body = JSON.stringify({ valid: false, code: result.code, error: result.error });
      return new Response(body, {
        status: result.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    return next(request, result.validation);
  };
}
