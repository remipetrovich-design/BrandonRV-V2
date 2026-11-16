import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import AdminAccessDenied from "@/components/admin-access-denied";
import AdminSupplierOrders from "@/components/admin-supplier-orders";
export const dynamic="force-dynamic";
export default async function SupplierOrdersPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/portal");
 if(!(await userHasPermission(user.id,"suppliers.view")))return <AdminAccessDenied resource="supplier orders"/>;
 const canManage=await userHasPermission(user.id,"suppliers.manage");
 return <main className="portal-page"><div className="shell portal-shell" style={{display:"block",maxWidth:1180}}>
  <div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> FINANCE & PURCHASING</p><h1>Supplier orders.</h1><p>Purchase orders linked to the Workcard parts they fulfil.</p></div>
  <AdminSupplierOrders canManage={canManage}/>
 </div></main>;
}
