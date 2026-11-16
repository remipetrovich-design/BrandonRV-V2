import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import AdminAccessDenied from "@/components/admin-access-denied";
import AdminExpenses from "@/components/admin-expenses";
export const dynamic="force-dynamic";
export default async function ExpensesPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/portal");
 if(!(await userHasPermission(user.id,"expenses.view")))return <AdminAccessDenied resource="expenses"/>;
 const canManage=await userHasPermission(user.id,"expenses.manage");
 return <main className="portal-page"><div className="shell portal-shell" style={{display:"block",maxWidth:1180}}>
  <div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> FINANCE & PURCHASING</p><h1>Expenses.</h1><p>Record actual business costs, attach receipts and link supplier purchases to the Workcard they belong to.</p></div>
  <AdminExpenses canManage={canManage}/>
 </div></main>;
}
