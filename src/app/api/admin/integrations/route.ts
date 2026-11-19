import {authorizePermission} from "@/lib/auth";
export const runtime="nodejs";
export async function GET(){
 const access=await authorizePermission("business.settings.manage");if(access.response)return access.response;
 return Response.json({integrations:[{id:"mail-system",name:"Mail System",description:"Central multi-domain Mail System used by Brandon RV email templates.",configured:Boolean(process.env.MAIL_SYSTEM_URL&&process.env.MAIL_SYSTEM_API_KEY),urlConfigured:Boolean(process.env.MAIL_SYSTEM_URL),keyConfigured:Boolean(process.env.MAIL_SYSTEM_API_KEY),management:"Email sender selection and templates are managed under Email Templates."}]});
}
