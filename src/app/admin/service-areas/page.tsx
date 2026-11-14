import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import AdminServiceAreasManager from "@/components/admin-service-areas-manager";
export const dynamic="force-dynamic";
export default async function AdminServiceAreasPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");const membership=await currentMembership(user.id);if(!membership)redirect("/staff");
 if(!(await userHasPermission(user.id,"business.settings.manage")))redirect("/admin");
 return <main className="portal-page"><AdminServiceAreasManager/></main>;
}