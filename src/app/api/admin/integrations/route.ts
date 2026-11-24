import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {discoverIntegrations} from "@/lib/integration-registry";
import {decryptIntegrationSecrets,encryptIntegrationSecrets} from "@/lib/integration-secrets";
import {testInstalledIntegration,validateInstalledIntegration} from "@/lib/integration-runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 const modules=await discoverIntegrations(),db=database();
 const {data,error}=await db.from("app_integrations").select("slug,active,endpoint,settings,secret_fields,updated_at");
 if(error)return jsonError("Could not load integration settings.",500);
 const saved=new Map((data??[]).map(row=>[row.slug,row]));
 return Response.json({integrations:modules.map(module=>{
  const row=saved.get(module.id);
  const secretFields=Array.isArray(row?.secret_fields)?row.secret_fields.filter((key:unknown):key is string=>typeof key==="string"):[];
  const values=row?.settings&&typeof row.settings==="object"&&!Array.isArray(row.settings)?row.settings:{};
  return {...module,installed:true,enabled:row?.active===true,endpoint:row?.endpoint??"",settings:values,secretConfigured:module.config.filter(field=>field.type==="secret").reduce((out,field)=>({...out,[field.key]:secretFields.includes(field.key)}),{}),updatedAt:row?.updated_at??null};
 })});
}

export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),id=String(body.id??"");
  const result=await testInstalledIntegration(id);
  await database().from("audit_events").insert({business_id:access.membership!.business_id,actor_user_id:access.user!.id,action:result.ok?"integration.connection_test_succeeded":"integration.connection_test_failed",entity_type:"app_integration",details:{integration_id:id}});
  return Response.json({success:result.ok,canSend:result.ok&&result.senders.length>0,message:result.message,senders:result.senders},{status:result.ok?200:502});
 }catch(error){return jsonError(error instanceof Error?error.message:"Could not test integration connection.",500);}
}

export async function PATCH(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),id=String(body.id??"");
  const module=(await discoverIntegrations()).find(item=>item.id===id);
  if(!module)return jsonError("Integration is not installed in /integrations or its server module is incomplete.",404);
  const db=database();
  const {data:existing,error:readError}=await db.from("app_integrations").select("secret,secret_fields,settings,active,endpoint").eq("slug",id).maybeSingle();
  if(readError)return jsonError("Could not load existing integration settings.",500);
  const priorSettings=existing?.settings&&typeof existing.settings==="object"&&!Array.isArray(existing.settings)?existing.settings:{};
  const settings={...priorSettings};
  const incoming=body.settings&&typeof body.settings==="object"&&!Array.isArray(body.settings)?body.settings:{};
  const incomingSecrets=body.secrets&&typeof body.secrets==="object"&&!Array.isArray(body.secrets)?body.secrets:{};
  const enabled=body.enabled===undefined?existing?.active===true:body.enabled===true;
  const secretsToSet:Record<string,string>={};
  for(const field of module.config){
   const value=incoming[field.key];
   if(field.type==="secret"){
    const secret=incomingSecrets[field.key];
    if(secret!==undefined&&secret!==null&&String(secret)!=="")secretsToSet[field.key]=String(secret).slice(0,4000);
    continue;
   }
   if(value===undefined)continue;
   if(field.type==="boolean"){if(typeof value!=="boolean")return jsonError("Invalid value for "+field.label+".");settings[field.key]=value;continue;}
   if(field.type==="number"){const n=Number(value);if(!Number.isFinite(n))return jsonError("Enter a valid number for "+field.label+".");settings[field.key]=n;continue;}
   const text=String(value).trim().slice(0,4000);
   if(field.required&&!text)return jsonError(field.label+" is required.");
   if(field.type==="url"&&text){try{const u=new URL(text);if(u.protocol!=="https:")throw new Error();}catch{return jsonError("Enter a valid HTTPS URL for "+field.label+".");}}
   if(field.type==="select"&&text&&!field.options?.includes(text))return jsonError("Invalid selection for "+field.label+".");
   settings[field.key]=text;
  }
  let encrypted=existing?.secret??"";
  let secretFields=Array.isArray(existing?.secret_fields)?existing.secret_fields.filter((key:unknown):key is string=>typeof key==="string"):[];
  if(Object.keys(secretsToSet).length){
   const priorSecrets=encrypted?decryptIntegrationSecrets(encrypted):{};
   const mergedSecrets={...priorSecrets,...secretsToSet};
   encrypted=encryptIntegrationSecrets(mergedSecrets);
   secretFields=Object.keys(mergedSecrets);
  }
  if(enabled){
   for(const field of module.config){
    if(field.required&&field.type!=="secret"&&(settings[field.key]===undefined||String(settings[field.key]).trim()===""))return jsonError(field.label+" is required.");
    if(field.required&&field.type==="secret"&&!secretFields.includes(field.key))return jsonError(field.label+" is required.");
   }
   if(encrypted)decryptIntegrationSecrets(encrypted);
   await validateInstalledIntegration(id);
  }
  const endpoint=typeof body.endpoint==="string"?body.endpoint.trim().slice(0,2000):(existing?.endpoint??"");
  if(endpoint){try{const u=new URL(endpoint);if(u.protocol!=="https:")throw new Error();}catch{return jsonError("Enter a valid HTTPS endpoint URL.");}}
  const {error}=await db.from("app_integrations").upsert({name:module.name,slug:module.id,description:module.description,endpoint,secret:encrypted,secret_fields:secretFields,active:enabled,settings,updated_at:new Date().toISOString()},{onConflict:"slug"});
  if(error)return jsonError("Could not save integration settings.",500);
  await db.from("audit_events").insert({business_id:access.membership!.business_id,actor_user_id:access.user!.id,action:enabled?"integration.enabled":existing?.active?"integration.disabled":"integration.configuration_updated",entity_type:"app_integration",details:{integration_id:id,enabled,configured_fields:Object.keys(settings),secret_fields_configured:secretFields}});
  return Response.json({success:true,enabled,secretConfigured:module.config.filter(field=>field.type==="secret").reduce((out,field)=>({...out,[field.key]:secretFields.includes(field.key)}),{})});
 }catch(error){return jsonError(error instanceof Error&&error.message.includes("INTEGRATIONS_ENCRYPTION_KEY")?error.message:"Could not save integration settings.",500);}
}
