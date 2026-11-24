import "server-only";
import {readdir,readFile,stat} from "node:fs/promises";
import path from "node:path";

export type IntegrationField={key:string;label:string;type:"text"|"url"|"secret"|"boolean"|"number"|"select";required?:boolean;description?:string;options?:string[]};
export type IntegrationManifest={id:string;name:string;version:string;description:string;config:IntegrationField[]};
const validId=/^[a-z0-9][a-z0-9-]{1,62}$/;
const validField=/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const types=new Set(["text","url","secret","boolean","number","select"]);
export async function discoverIntegrations(){
 const root=path.join(process.cwd(),"integrations");
 let entries;
 try{entries=await readdir(root,{withFileTypes:true});}catch{return [] as IntegrationManifest[];}
 const found:IntegrationManifest[]=[];
 for(const entry of entries){
  if(!entry.isDirectory()||entry.name.startsWith(".")||entry.name==="node_modules")continue;
  const folder=path.join(root,entry.name);
  try{
   const info=await stat(folder);if(!info.isDirectory())continue;
   const raw=JSON.parse(await readFile(path.join(folder,"integration.json"),"utf8"));
   if(!raw||typeof raw!=="object"||!validId.test(String(raw.id??""))||raw.id!==entry.name.toLowerCase().replace(/[^a-z0-9-]/g,"-"))continue;
   if(typeof raw.name!=="string"||!raw.name.trim()||typeof raw.version!=="string"||typeof raw.description!=="string"||!Array.isArray(raw.config))continue;
   const config:IntegrationField[]=[];
   for(const field of raw.config){
    if(!field||!validField.test(String(field.key??""))||typeof field.label!=="string"||!types.has(field.type))continue;
    if(field.type==="select"&&(!Array.isArray(field.options)||field.options.some((x:unknown)=>typeof x!=="string")))continue;
    config.push({key:field.key,label:field.label,type:field.type,required:field.required===true,description:typeof field.description==="string"?field.description:"",...(field.type==="select"?{options:field.options as string[]}:{})});
   }
   found.push({id:raw.id,name:raw.name.trim().slice(0,100),version:raw.version.slice(0,40),description:raw.description.slice(0,1000),config});
  }catch{/* Invalid or incomplete module folders are not loadable and are omitted. */}
 }
 return found.sort((a,b)=>a.name.localeCompare(b.name));
}
