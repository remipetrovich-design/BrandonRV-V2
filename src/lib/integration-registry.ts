import "server-only";
import {readdir,readFile,stat} from "node:fs/promises";
import path from "node:path";
import {CORE_INTEGRATION_EVENT_NAMES} from "@/lib/integration-events";

export type IntegrationField={key:string;label:string;type:"text"|"url"|"secret"|"boolean"|"number"|"select";required?:boolean;description?:string;options?:string[]};
export type IntegrationManifest={id:string;folder:string;name:string;version:string;description:string;entrypoint:"server.cjs";adminPage?:"admin-page.tsx";events:string[];config:IntegrationField[]};
const validId=/^[a-z0-9][a-z0-9-]{1,62}$/;
const validField=/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const validEvents=new Set<string>(CORE_INTEGRATION_EVENT_NAMES);
const types=new Set(["text","url","secret","boolean","number","select"]);
export async function discoverIntegrations(){
 const root=path.resolve(process.cwd(),"integrations");
 let entries;
 try{entries=await readdir(root,{withFileTypes:true});}catch{return [] as IntegrationManifest[];}
 const found:IntegrationManifest[]=[];
 for(const entry of entries){
  if(!entry.isDirectory()||entry.name.startsWith(".")||entry.name==="node_modules")continue;
  const folder=path.resolve(root,entry.name);
  try{
   if(path.dirname(folder)!==root||!(await stat(folder)).isDirectory())continue;
   const raw=JSON.parse(await readFile(path.join(folder,"integration.json"),"utf8"));
   const id=String(raw?.id??"");
   if(!raw||typeof raw!=="object"||!validId.test(id)||id!==entry.name.toLowerCase().replace(/[^a-z0-9-]/g,"-"))continue;
   if(typeof raw.name!=="string"||!raw.name.trim()||typeof raw.version!=="string"||typeof raw.description!=="string"||!Array.isArray(raw.config))continue;
   if(raw.entrypoint!=="server.cjs"||!(await stat(path.join(folder,"server.cjs"))).isFile())continue;\n   const adminPage=raw.adminPage===undefined?undefined:raw.adminPage==="admin-page.tsx"&&(await stat(path.join(folder,"admin-page.tsx")).catch(()=>null))?.isFile()?"admin-page.tsx":null;\n   if(adminPage===null)continue;
   const config:IntegrationField[]=[];
   const seen=new Set<string>();
   for(const field of raw.config){
    if(!field||!validField.test(String(field.key??""))||seen.has(field.key)||typeof field.label!=="string"||!types.has(field.type))continue;
    if(field.type==="select"&&(!Array.isArray(field.options)||field.options.length>100||field.options.some((x:unknown)=>typeof x!=="string")))continue;
    seen.add(field.key);
    config.push({key:field.key,label:field.label,type:field.type,required:field.required===true,description:typeof field.description==="string"?field.description.slice(0,500):"",...(field.type==="select"?{options:field.options as string[]}:{})});
   }
   const events:string[]=Array.isArray(raw.events)?[...new Set<string>(raw.events.filter((value:unknown):value is string=>typeof value==="string"&&validEvents.has(value)))]:[];
   found.push({id,folder:entry.name,name:raw.name.trim().slice(0,100),version:raw.version.slice(0,40),description:raw.description.slice(0,1000),entrypoint:"server.cjs",...(adminPage?{adminPage}:{}),events,config});
  }catch{/* Invalid or incomplete module folders are not loadable and are omitted. */}
 }
 return found.sort((a,b)=>a.name.localeCompare(b.name));
}
