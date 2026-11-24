"use client";

import {useMemo} from "react";
import {MailModuleConsole} from "./console";
import type {MailModuleStore,MailTemplate,MailTemplateRevision,MailRoute,MailTrigger,MailModuleSettings} from "./types";

async function request<T>(method:"GET"|"POST",body?:Record<string,unknown>,query=""):Promise<T>{
 const response=await fetch("/api/admin/mail-system"+query,{method,headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||data.message||"Mail System request failed.");
 return data as T;
}
export default function MailSystemConsolePage(){
 const store=useMemo<MailModuleStore>(()=>({
  async listTemplates(){return (await request<{templates:MailTemplate[]}>("GET",undefined,"?resource=templates")).templates;},
  async getTemplateByKey(key){return (await this.listTemplates()).find(item=>item.template_key===key)||null;},
  async saveTemplate(input){return (await request<{template:MailTemplate}>("POST",{action:"saveTemplate",input})).template;},
  async listTemplateRevisions(templateId){return (await request<{revisions:MailTemplateRevision[]}>("GET",undefined,"?resource=revisions&templateId="+encodeURIComponent(templateId))).revisions;},
  async restoreTemplateRevision(templateId,revision){return (await request<{template:MailTemplate}>("POST",{action:"restoreTemplateRevision",templateId,revision})).template;},
  async deleteTemplate(id){await request("POST",{action:"deleteTemplate",id});},
  async listRoutes(){return (await request<{routes:MailRoute[]}>("GET",undefined,"?resource=routes")).routes;},
  async saveRoute(input){return (await request<{route:MailRoute}>("POST",{action:"saveRoute",input})).route;},
  async deleteRoute(id){await request("POST",{action:"deleteRoute",id});},
  async listTriggers(){return (await request<{triggers:MailTrigger[]}>("GET",undefined,"?resource=triggers")).triggers;},
  async getTrigger(eventKey){return (await this.listTriggers()).find(item=>item.event_key===eventKey)||null;},
  async saveTrigger(input){return (await request<{trigger:MailTrigger}>("POST",{action:"saveTrigger",input})).trigger;},
  async deleteTrigger(id){await request("POST",{action:"deleteTrigger",id});},
  async getSettings(){return (await request<{settings:MailModuleSettings}>("GET",undefined,"?resource=settings")).settings;},
  async saveSettings(input){return (await request<{settings:MailModuleSettings}>("POST",{action:"saveSettings",input})).settings;}
 }),[]);
 async function onTestConnection(){
  const response=await fetch("/api/admin/integrations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:"mail-system"}),cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok&&!result.message)throw new Error(result.error||"Connection test failed.");
  return {connected:result.success===true,senders:result.senders||[],message:result.message||result.error||"Connection test failed."};
 }
 return <main className="portal-page"><div className="shell portal-shell brv-admin-page-inner"><div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> BUSINESS COMMUNICATIONS</p><h1>Mail System.</h1><p>Manage email templates, HTML content, sender routing, event triggers and module appearance.</p></div><MailModuleConsole store={store} onTestConnection={onTestConnection} canManage/></div></main>;
}
