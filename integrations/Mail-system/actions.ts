"use server";
import {authorizePermission,database} from "@/lib/auth";
import {testInstalledIntegration} from "@/lib/integration-runtime";
import {createSupabaseMailModuleStore} from "./supabase-store";
import type {MailModuleSettings,MailTemplate,MailRoute,MailTrigger} from "./types";
const BUCKET="mail-template-assets";
async function authorizedStore(){
 const access=await authorizePermission("integrations.manage");
 if(access.response)throw new Error(access.response.status===401?"Sign in to manage Mail System.":"You do not have permission to manage integrations.");
 const db=database();
 const {data,error}=await db.from("app_integrations").select("active").eq("slug","mail-system").maybeSingle();
 if(error)throw new Error("Could not verify Mail System integration status.");
 if(data?.active!==true)throw new Error("Mail System integration is disabled. Enable it in Integrations to use this page.");
 return createSupabaseMailModuleStore(db);
}
export async function listTemplates(){return (await authorizedStore()).listTemplates();}
export async function getTemplateByKey(key:string){return (await authorizedStore()).getTemplateByKey(key);}
export async function saveTemplate(input:Omit<MailTemplate,"id"|"created_at"|"updated_at">&{id?:string}){return (await authorizedStore()).saveTemplate(input);}
export async function listTemplateRevisions(id:string){return (await authorizedStore()).listTemplateRevisions(id);}
export async function restoreTemplateRevision(id:string,revision:number){return (await authorizedStore()).restoreTemplateRevision(id,revision);}
export async function deleteTemplate(id:string){return (await authorizedStore()).deleteTemplate(id);}
export async function listRoutes(){return (await authorizedStore()).listRoutes();}
export async function saveRoute(input:Omit<MailRoute,"id">&{id?:string}){return (await authorizedStore()).saveRoute(input);}
export async function deleteRoute(id:string){return (await authorizedStore()).deleteRoute(id);}
export async function listTriggers(){return (await authorizedStore()).listTriggers();}
export async function getTrigger(eventKey:string){return (await authorizedStore()).getTrigger(eventKey);}
export async function saveTrigger(input:Omit<MailTrigger,"id">&{id?:string}){return (await authorizedStore()).saveTrigger(input);}
export async function deleteTrigger(id:string){return (await authorizedStore()).deleteTrigger(id);}
export async function getSettings(){return (await authorizedStore()).getSettings();}
export async function saveSettings(input:MailModuleSettings){return (await authorizedStore()).saveSettings(input);}
export async function testMailConnection(){
 await authorizedStore();
 const result=await testInstalledIntegration("mail-system");
 return {connected:result.ok,canSend:result.ok,senders:result.senders??[],message:result.message,error:result.ok?undefined:result.message};
}
export async function uploadTemplateImage(form:FormData){
 await authorizedStore();
 const file=form.get("file");
 if(!(file instanceof File))throw new Error("Choose an image file.");
 const allowed=new Set(["image/png","image/jpeg","image/gif","image/webp"]);
 if(!allowed.has(file.type))throw new Error("Supported image formats are PNG, JPEG, GIF and WebP.");
 if(file.size<1||file.size>5*1024*1024)throw new Error("Images must be 5 MB or smaller.");
 const extension=({"image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/webp":"webp"} as Record<string,string>)[file.type];
 const storage=database().storage;
 const existing=await storage.getBucket(BUCKET);
 if(existing.error){
  const created=await storage.createBucket(BUCKET,{public:true,fileSizeLimit:5*1024*1024,allowedMimeTypes:[...allowed]});
  if(created.error&&!/already exists/i.test(created.error.message))throw new Error("Could not prepare Mail System image storage: "+created.error.message);
 }
 const path=crypto.randomUUID()+"."+extension;
 const uploaded=await storage.from(BUCKET).upload(path,await file.arrayBuffer(),{contentType:file.type,upsert:false,cacheControl:"31536000"});
 if(uploaded.error)throw new Error("Image upload failed: "+uploaded.error.message);
 return storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
