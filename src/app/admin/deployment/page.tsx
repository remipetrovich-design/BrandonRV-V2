import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isGlobalAdministrator } from "@/lib/user-role-policy.mjs";
import { isManualDeployAvailable } from "@/lib/deployment-control.mjs";
import AdminManualDeploy from "@/components/admin-manual-deploy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deployment control" };

export default async function AdminDeploymentPage() {
  const user = await currentUser();
  if (!user) redirect("/portal/sign-in");
  if (!isGlobalAdministrator(String(user.user_role ?? "").toLowerCase())) redirect("/admin");

  const state = isManualDeployAvailable({
    enabledFlag: process.env.BRANDON_RV_MANUAL_DEPLOY_ENABLED,
    dispatchToken: process.env.GITHUB_ACTIONS_DISPATCH_TOKEN
  });

  return (
    <main className="portal-page">
      <div className="portal-shell brv-admin-page-inner">
        <div className="portal-page-heading">
          <p className="eyebrow"><span className="eyebrow-line" /> SYSTEM OPERATIONS</p>
          <h1>Deployment <em>control.</em></h1>
          <p>Manually build Brandon RV V2, apply pending database migrations and deploy the application.</p>
        </div>
        <AdminManualDeploy configured={state.configured} activated={state.activated} />
      </div>
    </main>
  );
}
