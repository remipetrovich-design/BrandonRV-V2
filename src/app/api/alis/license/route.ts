import { NextRequest, NextResponse } from 'next/server';
import { createLicenseClient } from '../../../../../.alis/license-client/index.js';
import { alisConfig } from '../../../../../.alis/config.js';
import { createAlisDatabase } from '../../../../../.alis/license-storage.js';
import { currentUser } from '@/lib/auth';
import { isGlobalAdministrator } from '@/lib/user-role-policy.mjs';
const client = createLicenseClient({ product: alisConfig.productSlug, component: alisConfig.componentSlug, installationId: alisConfig.installationId });
type LicenseFailure = { code?: string; message?: string; status?: number; name?: string };
type LicenseValidation = { code?: string; license_status?: string; status?: string; license_id?: string | null; authority?: string | null; checkedAt?: number; expires_at?: string | null; expiry?: string | null; expiresAt?: string | null; offlineGrace?: boolean; offlineGraceRemainingSeconds?: number; [key: string]: unknown };
type AlisDatabase = ReturnType<typeof createAlisDatabase>;
type LicenseRecord = { license_key?: string | null };
type OwnerAccess = { ok: false; response: NextResponse } | { ok: true; db: AlisDatabase; user: NonNullable<Awaited<ReturnType<typeof currentUser>>> };
const errorInfo = (error: unknown): LicenseFailure => error && typeof error === 'object' ? error as LicenseFailure : {};
const transient = (error: unknown) => { const value = errorInfo(error); const code = String(value.code || '').toUpperCase(); const message = String(value.message || '').toLowerCase(); return Number(value.status || 0) >= 500 || [408,425,429].includes(Number(value.status || 0)) || ['AUTHORITY_DISCOVERY_FAILED','ACTIVE_AUTHORITY_UNAVAILABLE','PULSE_ACK_FAILED','ECONNRESET','ECONNREFUSED','ENOTFOUND','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code) || value.name === 'TypeError' || message.includes('fetch failed') || message.includes('network error') || message.includes('timed out') || message.includes('socket hang up'); };
const telemetry = (request: NextRequest) => ({ hostname: new URL(request.url).hostname, platform: 'nextjs', architecture: process.arch || 'nodejs', client: 'alis-next', clientVersion: alisConfig.moduleVersion, provider: process.env.VERCEL === '1' ? 'vercel' : process.env.CF_PAGES ? 'cloudflare' : 'self-hosted', region: process.env.VERCEL_REGION || undefined, components: [alisConfig.productSlug, alisConfig.componentSlug] });
const installationMetadata = (request: NextRequest) => ({ website: { ...alisConfig.website, hostname: new URL(request.url).hostname, origin: new URL(request.url).origin } });
const details = (validation: LicenseValidation, key: string | null) => ({ valid: true, state: "valid", code: validation.code || "LICENSE_VALID", keyHint: key ? "••••" + key.slice(-4) : null, installationId: alisConfig.installationId, product: alisConfig.productSlug, component: alisConfig.componentSlug, licenseStatus: validation.license_status || validation.status || "active", licenseId: validation.license_id || null, authority: validation.authority || null, checkedAt: validation.checkedAt || Date.now(), expiresAt: validation.expires_at || validation.expiry || validation.expiresAt || null, offlineGrace: validation.offlineGrace === true, offlineGraceRemainingSeconds: validation.offlineGraceRemainingSeconds || 0 });
async function owner(request: NextRequest): Promise<OwnerAccess> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, response: NextResponse.json({ valid: null, state: 'configuration', code: 'OWNER_AUTH_REQUIRED', message: 'Sign in with the website Owner or an administrator account.' }, { status: 401 }) };
    if (user.status !== 'active' || !isGlobalAdministrator(String(user.user_role || '').toLowerCase())) return { ok: false, response: NextResponse.json({ valid: null, state: 'configuration', code: 'OWNER_PERMISSION_REQUIRED', message: 'Only an active website Owner or administrator can manage the installation license.' }, { status: 403 }) };
    return { ok: true, db: createAlisDatabase(), user };
  } catch { return { ok: false, response: NextResponse.json({ valid: null, state: 'configuration', code: 'LICENSE_DATABASE_UNAVAILABLE', message: 'The server could not verify website permissions. Check the server-side Supabase connection.' }, { status: 503 }) }; }
}
async function record(db: AlisDatabase): Promise<LicenseRecord | null> { const { data, error } = await db.from('alis_installation_licenses').select('*').eq('installation_id', alisConfig.installationId).maybeSingle(); if (error) throw error; return data; }
async function event(db: AlisDatabase, actor: string, action: string, licenseId: string | null | undefined, code: string | undefined): Promise<void> { const { error } = await db.from('alis_license_events').insert({ installation_id: alisConfig.installationId, actor_id: actor, action, license_id: licenseId || null, validation_code: code || null, details: { product: alisConfig.productSlug, component: alisConfig.componentSlug } }); if (error) throw error; }
export async function GET(request: NextRequest) {
  try {
    const access = await owner(request); if (!access.ok) return access.response;
    const saved = await record(access.db);
    if (!saved?.license_key) { try { await client.detectAuthority({ force: true }); } catch (error) { const failure = errorInfo(error); return NextResponse.json({ valid: null, state: 'unavailable', code: failure.code || 'LICENSE_AUTHORITY_UNAVAILABLE', message: 'License Manager is unavailable. No key has been checked.' }, { status: 503 }); } return NextResponse.json({ valid: false, state: 'missing', code: 'LICENSE_KEY_MISSING', message: 'No license key is configured for this installation.', product: alisConfig.productSlug, component: alisConfig.componentSlug, installationId: alisConfig.installationId }); }
    try {
      const validation = await client.validate({ licenseKey: saved.license_key, productVersion: alisConfig.productVersion || undefined, telemetry: telemetry(request), metadata: installationMetadata(request) });
      await access.db.from('alis_installation_licenses').update({ license_status: 'valid', license_id: validation.license_id || null, authority: validation.authority || null, checked_at: new Date().toISOString(), expires_at: validation.expires_at || validation.expiry || validation.expiresAt || null, validation_metadata: validation, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq('installation_id', alisConfig.installationId);
      return NextResponse.json(details(validation, saved.license_key), { headers: { "cache-control": "no-store" } });
    } catch (error) { const failure = errorInfo(error); if (transient(error)) return NextResponse.json({ valid: null, state: 'unavailable', code: failure.code || 'LICENSE_AUTHORITY_UNAVAILABLE', message: 'License Manager is unavailable. The saved key has not been marked invalid.' }, { status: 503 }); return NextResponse.json({ valid: false, state: 'invalid', code: failure.code || 'LICENSE_INVALID', message: failure.message || 'License Manager rejected the saved key.' }, { status: 403 }); }
  } catch { return NextResponse.json({ valid: null, state: 'configuration', code: 'LICENSE_DATABASE_UNAVAILABLE', message: 'The server could not read the installation license record. Check the server-side Supabase connection and database permissions.' }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const access = await owner(request); if (!access.ok) return access.response;
  let body; try { body = await request.json(); } catch { return NextResponse.json({ valid: false, state: "invalid", code: "INVALID_REQUEST", message: "A valid JSON request is required." }, { status: 400 }); }
  const licenseKey = String(body?.licenseKey || '').trim(); if (!licenseKey || licenseKey.length > 256) return NextResponse.json({ valid: false, state: 'missing', code: 'LICENSE_KEY_REQUIRED', message: 'Enter a license key to continue.' }, { status: 400 });
  try {
    const validation = await client.validate({ licenseKey, productVersion: alisConfig.productVersion || undefined, telemetry: telemetry(request), metadata: installationMetadata(request) });
    const saved = await record(access.db);
    const { error } = await access.db.from('alis_installation_licenses').upsert({ installation_id: alisConfig.installationId, product_slug: alisConfig.productSlug, component_slug: alisConfig.componentSlug, license_key: licenseKey, license_status: 'valid', license_id: validation.license_id || null, authority: validation.authority || null, checked_at: new Date().toISOString(), expires_at: validation.expires_at || validation.expiry || validation.expiresAt || null, validation_metadata: validation, updated_by: access.user.id, updated_at: new Date().toISOString() }, { onConflict: 'installation_id' });
    if (error) return NextResponse.json({ valid: null, state: 'configuration', code: 'LICENSE_DATABASE_SAVE_FAILED', message: 'License Manager accepted the key, but the server could not save it to installation storage. Check Supabase service-role access and the A.L.I.S. database schema.' }, { status: 503 });
    await event(access.db, access.user.id, saved?.license_key ? 'license_replaced' : 'license_activated', validation.license_id, validation.code || 'LICENSE_VALID').catch(() => {});
    return NextResponse.json(details(validation, licenseKey), { headers: { "cache-control": "no-store" } });
  } catch (error) { if (transient(error)) return NextResponse.json({ valid: null, state: 'unavailable', code: error.code || 'LICENSE_AUTHORITY_UNAVAILABLE', message: 'License Manager is unavailable. The saved installation key has not been changed.' }, { status: 503 }); return NextResponse.json({ valid: false, state: 'invalid', code: failure.code || 'LICENSE_INVALID', message: failure.message || 'License Manager rejected this key.' }, { status: 403 }); }
}
export async function DELETE(request: NextRequest) {
  const access = await owner(request); if (!access.ok) return access.response;
  const { error } = await access.db.from('alis_installation_licenses').delete().eq('installation_id', alisConfig.installationId);
  if (error) return NextResponse.json({ cleared: false, code: 'LICENSE_DATABASE_UNAVAILABLE' }, { status: 503 });
  await event(access.db, access.user.id, 'license_cleared', null, 'LICENSE_CLEARED').catch(() => {}); return NextResponse.json({ cleared: true });
}
