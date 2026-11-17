import { currentUser } from '@/lib/auth';
import { isGlobalAdministrator } from '@/lib/user-role-policy.mjs';
import AlisLicenseClient from './license-client';
export const dynamic = 'force-dynamic';
export default async function AlisLicensePage() {
 const user = await currentUser();
 if (!user || user.status !== 'active' || !isGlobalAdministrator(String(user.user_role || '').toLowerCase())) return <AlisLicenseClient />;
 return <AlisLicenseClient />;
}
