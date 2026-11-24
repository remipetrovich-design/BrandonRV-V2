import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import AdminIntegrations from "@/components/admin-integrations";
export const dynamic="force-dynamic";
export default async function IntegrationsPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/staff");
 if(!(await userHasPermission(user.id,"integrations.manage")))redirect("/admin");
 return <main className="portal-page"><div className="shell portal-shell brv-admin-page-inner"><div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> SYSTEM MANAGEMENT</p><h1>Integrations.</h1><p>Discover installed modules, manage their configuration and control whether each integration is enabled.</p></div><AdminIntegrations/></div></main>;
}
