import {redirect} from "next/navigation";
import {currentUser,userHasPermission} from "@/lib/auth";
import {getApplicationLicenseState} from "@/lib/brandon-license";
import LicenseMonitor from "@/components/admin-license-monitor";
export const dynamic="force-dynamic";
export const metadata={title:"Application licence"};
export default async function AdminLicensePage(){
 const user=await currentUser();
 if(!user)redirect("/portal/sign-in");
 if(!(await userHasPermission(user.id,"business.settings.manage")))redirect("/admin");
 const state=await getApplicationLicenseState();
 return <main className="portal-page"><div className="portal-shell brv-admin-page-inner"><div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> SYSTEM HEALTH</p><h1>Application <em>licence.</em></h1><p>Monitor the Brandon RV business installation licence and recheck it against the active License Manager.</p></div><LicenseMonitor initialState={state}/></div></main>;
}
