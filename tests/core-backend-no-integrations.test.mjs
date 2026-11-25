import test from "node:test";
import assert from "node:assert/strict";
import {readFile,access} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("core application exposes integration management with one canonical Mail System provider module",async()=>{
 const adminLayout=await read("src/app/admin/layout.tsx"),index=await read("integrations/README.md");
 assert.match(adminLayout,/\/admin\/integrations/);
 assert.match(index,/Mail System is installed here as a standalone provider module/);
 await access(new URL("../src/app/admin/integrations/page.tsx",import.meta.url));
 await access(new URL("../integrations/Mail-system/integration.json",import.meta.url));
 await access(new URL("../integrations/Mail-system/server.cjs",import.meta.url));
 await assert.rejects(access(new URL("../integrations/Mail-System",import.meta.url)));
 await assert.rejects(access(new URL("../integrations/Plugin2",import.meta.url)));
 await assert.rejects(access(new URL("../src/app/admin/email-templates/page.tsx",import.meta.url)));
 await assert.rejects(access(new URL("../src/lib/email.ts",import.meta.url)));
});

test("customer registration and sign-in do not depend on email verification or outbound delivery",async()=>{
 const registration=await read("src/app/api/auth/register/route.ts"),login=await read("src/app/api/auth/login/route.ts"),enquiries=await read("src/app/api/enquiries/route.ts");
 assert.match(registration,/status:"active"/);
 assert.doesNotMatch(registration,/email_verified_at|verificationEnabled|@\/lib\/email|sendEmail/);
 assert.doesNotMatch(login,/verify your email|check your inbox|email_verified_at/);
 assert.doesNotMatch(enquiries,/@\/lib\/email|sendBrandonRvTemplateEmail|sendEmail\(/);
 await assert.rejects(access(new URL("../src/app/api/auth/verify-email/route.ts",import.meta.url)));
 await assert.rejects(access(new URL("../src/app/portal/verify-email/page.tsx",import.meta.url)));
 await assert.rejects(access(new URL("../src/components/admin-customer-email-verification.tsx",import.meta.url)));
});

test("staff invitations emit an integration event and retain a manual link fallback",async()=>{
 const invitations=await read("src/app/api/staff/invitations/route.ts"),ui=await read("src/components/admin-staff-invitations.tsx");
 assert.match(invitations,/emitIntegrationEvent\("staff\.invitation_created"/);
 assert.match(invitations,/notificationHandled/);
 assert.match(ui,/notificationHandled/);
 assert.match(invitations,/inviteUrl:link/);
 assert.doesNotMatch(invitations,/@\/lib\/email|sendBrandonRvTemplateEmail|sendEmail/);
});

test("password recovery and password changes emit core integration events",async()=>{
 const recovery=await read("src/app/api/auth/forgot-password/route.ts"),reset=await read("src/app/api/auth/reset-password/route.ts");
 assert.match(recovery,/emitIntegrationEvent\("account\.password_reset_requested"/);
 assert.match(reset,/emitIntegrationEvent\("account\.password_changed"/);
 assert.match(recovery,/genericMessage/);
 assert.match(recovery,/password_reset_tokens/);
});

test("legacy email verification is replaced with manual customer activation",async()=>{
 const admin=await read("src/app/admin/[section]/page.tsx"),activation=await read("src/app/api/admin/customers/[id]/activate/route.ts");
 assert.match(admin,/AdminCustomerActivation/);
 assert.match(activation,/customer\.account_manually_activated/);
 await assert.rejects(access(new URL("../src/app/api/admin/customers/[id]/verify-email/route.ts",import.meta.url)));
});

test("legacy email template and verification token storage are removed from the core schema",async()=>{
 const cleanup=await read("supabase/migrations/20261124115557_remove_core_email_templates.sql");
 assert.match(cleanup,/DROP TABLE IF EXISTS public\.email_templates/i);
 assert.match(cleanup,/DROP TABLE IF EXISTS public\.email_verification_tokens/i);
});

test("the future integration archive remains untouched in the repository root",async()=>{
 await access(new URL("../Mail-system.zip",import.meta.url));
});
