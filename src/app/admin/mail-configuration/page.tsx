import { redirect } from "next/navigation";
import { currentUser, currentMembership, userHasPermission } from "@/lib/auth";
import { MailConfigurationPage } from "@/lib/mail-configuration-page";

export const dynamic = "force-dynamic";

export default async function AdminMailConfigurationPage() {
  const user = await currentUser();
  if (!user) redirect("/portal/sign-in");
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/staff");
  if (!(await userHasPermission(user.id, "business.settings.manage"))) redirect("/admin");
  return (
    <main className="portal-page">
      <div className="shell portal-shell brv-admin-page-inner brv-admin-page-inner--medium">
        <div className="portal-page-heading">
          <p className="eyebrow"><span className="eyebrow-line" /> BUSINESS CONFIGURATION</p>
          <h1>Mail <em>configuration.</em></h1>
          <p>Connection status and authorized sender mailboxes for Brandon RV.</p>
        </div>
        <MailConfigurationPage applicationName="Brandon RV" templatesHref="/admin/email-templates" />
      </div>
    </main>
  );
}
