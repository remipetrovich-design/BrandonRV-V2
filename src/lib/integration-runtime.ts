import "server-only";
import {createRequire} from "node:module";
import path from "node:path";
import {discoverIntegrations,type IntegrationManifest} from "@/lib/integration-registry";
import {database} from "@/lib/auth";
import {decryptIntegrationSecrets} from "@/lib/integration-secrets";
import type {CoreIntegrationEvent} from "@/lib/integration-events";

export type IntegrationContext={id:string;name:string;version:string;endpoint:string;settings:Record<string,unknown>;secrets:Record<string,string>};
export type IntegrationTestResult={ok:boolean;message:string};
type IntegrationModule={
 testConnection:(context:IntegrationContext)=>Promise<IntegrationTestResult>;
 handleEvent:(input:{event:string;payload:unknown},context:IntegrationContext)=>Promise<unknown>;
};
const requireFromApp=createRequire(path.join(process.cwd(),"package.json"));
const validEvent=/^[a-z0-9][a-z0-9._-]{0,99}$/;

function moduleFor(manifest:IntegrationManifest):IntegrationModule{
 const folder=path.resolve(process.cwd(),"integrations",manifest.folder);
 const entry=path.resolve(folder,"server.cjs");
 if(path.dirname(entry)!==folder)throw new Error("Invalid integration entry point.");
 const loaded=requireFromApp(entry) as Partial<IntegrationModule>&{default?:Partial<IntegrationModule>};
 const candidate=loaded.default??loaded;
 if(typeof candidate.testConnection!=="function"||typeof candidate.handleEvent!=="function")throw new Error("Integration server.cjs must export testConnection and handleEvent functions.");
 return candidate as IntegrationModule;
}
function contextFor(manifest:IntegrationManifest,row:{endpoint:string|null;settings:unknown;secret:string|null}):IntegrationContext{
 const settings=row.settings&&typeof row.settings==="object"&&!Array.isArray(row.settings)?row.settings as Record<string,unknown>:{};
 return {id:manifest.id,name:manifest.name,version:manifest.version,endpoint:row.endpoint??"",settings,secrets:row.secret?decryptIntegrationSecrets(row.secret):{}};
}
export function validateInstalledIntegration(id:string){\n const manifestPromise=discoverIntegrations();\n return manifestPromise.then(manifests=>{const manifest=manifests.find(item=>item.id===id);if(!manifest)throw new Error("Integration is not installed or its module files are incomplete.");moduleFor(manifest);});\n}\n\nexport async function testInstalledIntegration(id:string):Promise<IntegrationTestResult>{
 const manifest=(await discoverIntegrations()).find(item=>item.id===id);
 if(!manifest)throw new Error("Integration is not installed or its module files are incomplete.");
 const {data,error}=await database().from("app_integrations").select("endpoint,settings,secret,active").eq("slug",id).maybeSingle();
 if(error)throw new Error("Could not load integration configuration.");
 if(!data)throw new Error("Save the integration configuration before testing the connection.");
 const context=contextFor(manifest,data);
 for(const field of manifest.config)if(field.required&&(field.type==="secret"?!context.secrets[field.key]:context.settings[field.key]===undefined||String(context.settings[field.key]).trim()===""))throw new Error(field.label+" is required before testing the connection.");
 const result=await moduleFor(manifest).testConnection(context);
 if(!result||typeof result.ok!=="boolean"||typeof result.message!=="string")throw new Error("Integration returned an invalid connection-test result.");
 return {ok:result.ok,message:result.message.slice(0,500)};
}

/** Dispatch a named core event to every enabled installed module that declares it in integration.json. */
export async function dispatchIntegrationEvent(event:CoreIntegrationEvent,payload:unknown){
 if(!validEvent.test(event))throw new Error("Invalid integration event name.");
 const manifests=await discoverIntegrations(),byId=new Map(manifests.map(item=>[item.id,item]));
 const {data,error}=await database().from("app_integrations").select("slug,endpoint,settings,secret").eq("active",true);
 if(error)throw new Error("Could not load enabled integrations.");
 const results:{integrationId:string;ok:boolean;error?:string}[]=[];
 for(const row of data??[]){
  const manifest=byId.get(row.slug);
  if(!manifest||!manifest.events.includes(event))continue;
  try{
   await moduleFor(manifest).handleEvent({event,payload},contextFor(manifest,row));
   results.push({integrationId:manifest.id,ok:true});
  }catch(error){
   const message=error instanceof Error?error.message:"Integration event failed.";
   console.error("[integration-runtime] event handler failed",manifest.id,event,message);
   results.push({integrationId:manifest.id,ok:false,error:message.slice(0,300)});
  }
 }
 return results;
}
