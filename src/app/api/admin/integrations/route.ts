import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {discoverIntegrations} from "@/lib/integration-registry";
import {decryptIntegrationSecrets,encryptIntegrationSecrets} from "@/lib/integration-secrets";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 const modules=await discoverIntegrations(),db=database();
 const {data,error}=await db.from("app_integrations").select("slug,active,endpoint,settings,secret,updated_at");
 if(error)return jsonError("Could not load integration settings.",500);
 const saved=new Map((data??[]).map(row=>[row.slug,row]));
 return Response.json({integrations:modules.map(module=>{
  const row=saved.get(module.id),secrets=row?.secret?(()=>{try{return decryptIntegrationSecrets(row.secret)}catch{return {}}})():{};
  const values=row?.settings&&typeof row.settings==="object"?row.settings:{};
  return {...module,installed:true,enabled:row?.active===true,endpoint:row?.endpoint??"",settings:values,secretConfigured:module.config.filter(field=>field.type==="secret").reduce((out,field)=>({...out,[field.key]:Boolean(secrets[field.key])}),{}),updatedAt:row?.updated_at??null};
 })});
}
export async function PATCH(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),id=String(body.id??"");
  const module=(await discoverIntegrations()).find(item=>item.id===id);
  if(!module)return jsonError("This integration is not installed in /integrations.",404);
  const db=database();
  const {data:existing}=await db.from("app_integrations").select("secret,settings,active,endpoint").eq("slug",id).maybeSingle();
  const priorSettings=existing?.settings&&typeof existing.settings==="object"?existing.settings:{};
  const settings={...priorSettings};
  const priorSecrets=existing?.secret?decryptIntegrationSecrets(existing.secret):{};
  const secrets={...priorSecrets};
  const incoming=body.settings&&typeof body.settings==="object"&&!Array.isArray(body.settings)?body.settings:{};
  const incomingSecrets=body.secrets&&typeof body.secrets==="object"&&!Array.isArray(body.secrets)?body.secrets:{};
  const enabled=body.enabled===undefined?existing?.active===true:body.enabled===true;
  for(const field of module.config){
   const value=incoming[field.key];
   if(field.type==="secret"){
    const secret=incomingSecrets[field.key];
    if(secret!==undefined&&secret!==null&&String(secret)!=="")secrets[field.key]=String(secret).slice(0,4000);
    continue;
   }
   if(value===undefined)continue;
   if(field.type==="boolean"){if(typeof value!=="boolean")return jsonError("Invalid value for "+field.label+".");settings[field.key]=value;continue;}
   if(field.type==="number"){const n=Number(value);if(!Number.isFinite(n))return jsonError("Enter a valid number for "+field.label+".");settings[field.key]=n;continue;}
   const text=String(value).trim().slice(0,4000);
   if(field.required&&!text)return jsonError(field.label+" is required.");
   if(field.type==="url"&&text){try{const u=new URL(text);if(!["http:","https:"].includes(u.protocol))throw new Error();}catch{return jsonError("Enter a valid HTTPS or HTTP URL for "+field.label+".");}}
   if(field.type==="select"&&text&&!field.options?.includes(text))return jsonError("Invalid selection for "+field.label+".");
   settings[field.key]=text;
  }
  if(enabled)for(const field of module.config){if(field.required&&field.type!=="secret"&&!String(settings[field.key]??"").trim())return jsonError(field.label+" is required.");if(field.required&&field.type==="secret"&&!secrets[field.key])return jsonError(field.label+" is required.");}
  if(enabled&&!module.config.every(field=>!field.required||(field.type==="secret"?Boolean(secrets[field.key]):settings[field.key]!==undefined&&String(settings[field.key]).trim()!=="")))return jsonError("Complete all required configuration fields before enabling this integration.");
  let encrypted=existing?.secret??"";
  if(Object.keys(secrets).length)encrypted=encryptIntegrationSecrets(secrets);
  const endpoint=typeof body.endpoint==="string"?body.endpoint.trim().slice(0,2000):(existing?.endpoint??"");
  if(endpoint){try{const u=new URL(endpoint);if(!["http:","https:"].includes(u.protocol))throw new Error();}catch{return jsonError("Enter a valid integration endpoint URL.");}}
  const now=new Date().toISOString();
  const {error}=await db.from("app_integrations").upsert({name:module.name,slug:module.id,description:module.description,endpoint,secret:encrypted,active:enabled,settings,updated_at:now},{onConflict:"slug"});
  if(error)return jsonError("Could not save integration settings.",500);
  await db.from("audit_events").insert({business_id:access.membership!.business_id,actor_user_id:access.user!.id,action:enabled?"integration.enabled":"integration.configuration_updated",entity_type:"app_integration",details:{integration_id:id,enabled,configured_fields:Object.keys(settings),secret_fields_configured:Object.keys(secrets)}});
  return Response.json({success:true,enabled,secretConfigured:module.config.filter(field=>field.type==="secret").reduce((out,field)=>({...out,[field.key]:Boolean(secrets[field.key])}),{})});
 }catch(error){return jsonError(error instanceof Error&&error.message.includes("INTEGRATIONS_ENCRYPTION_KEY")?error.message:"Could not save integration settings.",500);}
}
