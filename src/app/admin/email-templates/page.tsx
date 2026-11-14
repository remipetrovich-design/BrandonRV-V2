import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import AdminEmailTemplates from "@/components/admin-email-templates";
export const dynamic="force-dynamic";
export default async function AdminEmailTemplatesPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");const membership=await currentMembership(user.id);if(!membership)redirect("/staff");
 if(!(await userHasPermission(user.id,"business.settings.manage")))redirect("/admin");
 return <main className="portal-page"><AdminEmailTemplates/></main>;
}
