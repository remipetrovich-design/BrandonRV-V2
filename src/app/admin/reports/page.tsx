import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import AdminAccessDenied from "@/components/admin-access-denied";
import AdminBusinessReports from "@/components/admin-business-reports";
export const dynamic="force-dynamic";
function sydneyDate(){
 const parts=new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return value.year+"-"+value.month+"-"+value.day;
}
export default async function BusinessReportsPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/portal");
 if(!(await userHasPermission(user.id,"reports.view")))return <AdminAccessDenied resource="business reports"/>;
 const today=sydneyDate();
 return <main className="portal-page"><div className="shell portal-shell" style={{display:"block",maxWidth:1320}}>
  <div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> BUSINESS OPERATIONS</p><h1>Business reports.</h1><p>Financial and operational totals from the same invoices, payments, expenses, supplier orders and Workcards used by the business.</p></div>
  <AdminBusinessReports initialTo={today} initialFrom={today.slice(0,7)+"-01"}/>
 </div></main>;
}
