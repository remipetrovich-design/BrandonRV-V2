import {notFound} from "next/navigation";
import {authorizePermission,database} from "@/lib/auth";
import {discoverIntegrations} from "@/lib/integration-registry";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function InstalledIntegrationPage({params}:{params:Promise<{integrationId:string}>}){
 const access=await authorizePermission("integrations.manage");
 if(access.response)notFound();
 const {integrationId}=await params;
 const manifest=(await discoverIntegrations()).find(item=>item.id===integrationId&&item.adminPage==="admin-page.tsx");
 if(!manifest)notFound();
 const {data,error}=await database().from("app_integrations").select("active").eq("slug",integrationId).maybeSingle();
 if(error||data?.active!==true)notFound();
 const modulePage=await import(`../../../../../integrations/${manifest.folder}/admin-page`);
 if(typeof modulePage.default!=="function")notFound();
 const Page=modulePage.default;
 return <Page/>;
}
