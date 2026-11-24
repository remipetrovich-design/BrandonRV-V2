import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("core application has no active integrations or email-template administration", async () => {
  const adminLayout = await read("src/app/admin/layout.tsx");
  const integrationsIndex = await read("integrations/README.md");
  assert.doesNotMatch(adminLayout, /Email templates|\/admin\/integrations/);
  assert.match(integrationsIndex, /No integrations are included in the core application/);
  await assert.rejects(access(new URL("../src/app/admin/integrations/page.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../src/app/admin/email-templates/page.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../src/lib/email.ts", import.meta.url)));
});

test("registration and enquiry intake do not depend on outbound mail", async () => {
  const registration = await read("src/app/api/auth/register/route.ts");
  const enquiries = await read("src/app/api/enquiries/route.ts");
  assert.doesNotMatch(registration, /@\/lib\/email|sendBrandonRvTemplateEmail|isEmailConfigured/);
  assert.match(registration, /status:"active"/);
  assert.doesNotMatch(enquiries, /@\/lib\/email|sendBrandonRvTemplateEmail|sendEmail\(/);
});

test("staff invitations create a secure link without attempting delivery", async () => {
  const invitations = await read("src/app/api/staff/invitations/route.ts");
  assert.doesNotMatch(invitations, /@\/lib\/email|sendBrandonRvTemplateEmail/);
  assert.match(invitations, /delivery:"manual_link"/);
  assert.match(invitations, /emailSent:false,inviteUrl:link/);
});

test("password recovery remains explicitly unavailable until the notification module is installed", async () => {
  const recovery = await read("src/app/api/auth/forgot-password/route.ts");
  assert.match(recovery, /account-notification module is installed/);
  assert.match(recovery, /,503\)/);
});

test("the future mail module archive remains untouched in the repository root", async () => {
  await access(new URL("../mail-configuration-module.zip", import.meta.url));
});
