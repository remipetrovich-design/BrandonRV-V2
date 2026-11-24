import { redirect } from "next/navigation";
import { currentUser, currentMembership, userHasPermission } from "@/lib/auth";
import AdminMailSystem from "@/components/admin-mail-system";

export const dynamic = "force-dynamic";

export default async function MailSystemSettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/portal/sign-in");
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/staff");
  if (!(await userHasPermission(user.id, "integrations.manage"))) redirect("/admin");

  return (
    <main className="portal-page">
      <div className="shell portal-shell brv-admin-page-inner">
        <div className="portal-page-heading">
          <p className="eyebrow"><span className="eyebrow-line" /> SYSTEM CONFIGURATION</p>
          <h1>Mail <em>System.</em></h1>
          <p>Configure automated emails, templates, sender routing and event triggers for Brandon RV.</p>
        </div>
        <AdminMailSystem />
      </div>
    </main>
  );
}
