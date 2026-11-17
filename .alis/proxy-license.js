import { NextResponse } from 'next/server';
import { createLicenseClient } from './license-client/index.js';
import { createFetchGate } from './license-client/enforcement.js';
import { alisConfig } from './config.js';
import { readAlisLicenseKey } from './license-edge-storage.js';
const client = createLicenseClient({ product: alisConfig.productSlug, component: alisConfig.componentSlug, installationId: alisConfig.installationId });
const evaluateLicense = createFetchGate(client, { getLicenseInput: async (request) => ({ licenseKey: await readAlisLicenseKey(alisConfig.installationId), productVersion: alisConfig.productVersion || undefined, telemetry: { hostname: new URL(request.url).hostname, platform: 'nextjs', architecture: 'nodejs', client: 'alis-next', clientVersion: alisConfig.moduleVersion, provider: process.env.VERCEL === '1' ? 'vercel' : 'self-hosted', region: process.env.VERCEL_REGION || undefined, components: [alisConfig.productSlug, alisConfig.componentSlug] }, metadata: { website: { ...alisConfig.website, hostname: new URL(request.url).hostname, origin: new URL(request.url).origin } } }) });
const publicPaths = ["/portal/sign-in","/setup","/api/auth","/api/alis/license","/license"];
export async function checkAlisLicense(request) {
 const pathname = request.nextUrl.pathname;
 if (pathname.startsWith('/_next/') || /\.[^/]+$/.test(pathname) || ['/favicon.ico','/robots.txt','/sitemap.xml'].includes(pathname)) return null;
 if (publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'))) return null;
 const destination = request.nextUrl.clone(); destination.pathname = '/license'; destination.searchParams.set('next', pathname + request.nextUrl.search);
 try { const decision = await evaluateLicense(request); if (decision.allowed) return null; destination.searchParams.set('reason', decision.code || 'LICENSE_INVALID'); return NextResponse.redirect(destination); }
 catch { destination.searchParams.set('reason', 'LICENSE_STORAGE_UNAVAILABLE'); return NextResponse.redirect(destination); }
}
