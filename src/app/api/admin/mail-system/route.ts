import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {createSupabaseMailModuleStore} from "../../../../../integrations/Mail-system/supabase-store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const store=()=>createSupabaseMailModuleStore(database() as any);

export async function GET(request:Request){
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 try{
  const url=new URL(request.url),resource=url.searchParams.get("resource")||"";
  const mail=store();
  if(resource==="templates")return Response.json({templates:await mail.listTemplates()});
  if(resource==="routes")return Response.json({routes:await mail.listRoutes()});
  if(resource==="triggers")return Response.json({triggers:await mail.listTriggers()});
  if(resource==="settings")return Response.json({settings:await mail.getSettings()});
  if(resource==="revisions"){
   const templateId=url.searchParams.get("templateId")||"";
   if(!templateId)return jsonError("Template id is required.");
   return Response.json({revisions:await mail.listTemplateRevisions(templateId)});
  }
  return jsonError("Unknown Mail System resource.",400);
 }catch(error){return jsonError(error instanceof Error?error.message:"Could not load Mail System settings.",500);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),mail=store(),action=String(body.action||"");
  let result:unknown=null;
  switch(action){
   case "saveTemplate":result={template:await mail.saveTemplate(body.input)};break;
   case "deleteTemplate":await mail.deleteTemplate(String(body.id||""));result={success:true};break;
   case "restoreTemplateRevision":result={template:await mail.restoreTemplateRevision(String(body.templateId||""),Number(body.revision))};break;
   case "saveRoute":result={route:await mail.saveRoute(body.input)};break;
   case "deleteRoute":await mail.deleteRoute(String(body.id||""));result={success:true};break;
   case "saveTrigger":result={trigger:await mail.saveTrigger(body.input)};break;
   case "deleteTrigger":await mail.deleteTrigger(String(body.id||""));result={success:true};break;
   case "saveSettings":result={settings:await mail.saveSettings(body.input)};break;
   default:return jsonError("Unknown Mail System action.",400);
  }
  await database().from("audit_events").insert({business_id:access.membership!.business_id,actor_user_id:access.user!.id,action:"mail_system."+action,entity_type:"mail_system_configuration",details:{operation:action}});
  return Response.json(result);
 }catch(error){return jsonError(error instanceof Error?error.message:"Mail System operation failed.",500);}
}
