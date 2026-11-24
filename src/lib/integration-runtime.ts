import "server-only";
import {createRequire} from "node:module";
import path from "node:path";
import {discoverIntegrations,discoverIntegrationEvents,type IntegrationManifest} from "@/lib/integration-registry";
import {database} from "@/lib/auth";
import {decryptIntegrationSecrets} from "@/lib/integration-secrets";


export type IntegrationContext={id:string;name:string;version:string;endpoint:string;settings:Record<string,unknown>;secrets:Record<string,string>};
export type IntegrationTestResult={ok:boolean;message:string;senders?:{id:string;address:string}[]};
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
export function validateInstalledIntegration(id:string){
 const manifestPromise=discoverIntegrations();
 return manifestPromise.then(manifests=>{const manifest=manifests.find(item=>item.id===id);if(!manifest)throw new Error("Integration is not installed or its module files are incomplete.");moduleFor(manifest);});
}

export async function testInstalledIntegration(id:string):Promise<IntegrationTestResult>{
 const manifest=(await discoverIntegrations()).find(item=>item.id===id);
 if(!manifest)throw new Error("Integration is not installed or its module files are incomplete.");
 const {data,error}=await database().from("app_integrations").select("endpoint,settings,secret,active").eq("slug",id).maybeSingle();
 if(error)throw new Error("Could not load integration configuration.");
 if(!data)throw new Error("Save the integration configuration before testing the connection.");
 const context=contextFor(manifest,data);
 for(const field of manifest.config)if(field.required&&(field.type==="secret"?!context.secrets[field.key]:context.settings[field.key]===undefined||String(context.settings[field.key]).trim()===""))throw new Error(field.label+" is required before testing the connection.");
 const result=await moduleFor(manifest).testConnection(context);
 if(!result||typeof result.ok!=="boolean"||typeof result.message!=="string")throw new Error("Integration returned an invalid connection-test result.");
 const senders=Array.isArray(result.senders)?result.senders.flatMap((item:unknown)=>{
  if(!item||typeof item!=="object")return [];
  const value=item as {id?:unknown;address?:unknown};
  const address=typeof value.address==="string"?value.address.trim().toLowerCase():"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))return [];
  const id=value.id===undefined||value.id===null||String(value.id).trim()===""?address:String(value.id);
  return [{id,address}];
 }).filter((item,index,all)=>all.findIndex(candidate=>candidate.address===item.address)===index).slice(0,100):[];
 return {ok:result.ok,message:result.message.slice(0,500),senders};
}

/** Dispatch a registered host or integration event to enabled subscribers. */
export async function dispatchIntegrationEvent(event:string,payload:unknown){
 if(!validEvent.test(event))throw new Error("Invalid integration event name.");
 const [manifests,registered]=await Promise.all([discoverIntegrations(),discoverIntegrationEvents()]);
 if(!registered.some(item=>item.name===event))throw new Error("Integration event is not registered: "+event);
 const byId=new Map(manifests.map(item=>[item.id,item]));
 const {data,error}=await database().from("app_integrations").select("slug,endpoint,settings,secret").eq("active",true);
 if(error)throw new Error("Could not load enabled integrations.");
 const results:{integrationId:string;ok:boolean;error?:string}[]=[];
 for(const row of data??[]){
  const manifest=byId.get(row.slug);
  if(!manifest||(!manifest.events.includes(event)&&!manifest.events.includes("*")))continue;
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
