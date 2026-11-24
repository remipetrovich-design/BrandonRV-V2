import {redirect} from "next/navigation";
import {currentUser,currentMembership,userHasPermission} from "@/lib/auth";
import MailSystemConsolePage from "@/integrations/Mail-system/admin-console-page";
export const dynamic="force-dynamic";
export default async function MailSystemPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/staff");
 if(!(await userHasPermission(user.id,"integrations.manage")))redirect("/admin");
 return <MailSystemConsolePage/>;
}
