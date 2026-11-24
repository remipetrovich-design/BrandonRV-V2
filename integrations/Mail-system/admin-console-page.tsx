"use client";

import {useMemo} from "react";
import {MailModuleConsole} from "./console";
import type {MailModuleStore,MailTemplate,MailTemplateRevision,MailRoute,MailTrigger,MailModuleSettings} from "./types";

async function request<T>(body:Record<string,unknown>):Promise<T>{
 const response=await fetch("/api/admin/mail-system",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||result.success!==true)throw new Error(result.error||result.message||"Mail System request failed.");
 return result.data as T;
}
const availableEvents=[
 "account.password_reset_requested","account.password_changed","staff.invitation_created","customer.account_created",
 "enquiry.received","quote.issued","quote.accepted","quote.declined","quote.changes_requested","booking.requested",
 "booking.confirmed","booking.rescheduled","booking.cancelled","job.assigned","job.started","job.completed",
 "job.customer_approval_requested","job.customer_approved","job.customer_changes_requested","invoice.issued",
 "payment.received","payment.refunded","invoice.credit_issued"
];
export default function MailSystemConsolePage(){
 const store=useMemo<MailModuleStore>(()=>({
  async listTemplates(){return request<MailTemplate[]>({action:"listTemplates"});},
  async getTemplateByKey(key){return request<MailTemplate|null>({action:"getTemplateByKey",key});},
  async saveTemplate(input){return request<MailTemplate>({action:"saveTemplate",input});},
  async listTemplateRevisions(templateId){return request<MailTemplateRevision[]>({action:"listTemplateRevisions",templateId});},
  async restoreTemplateRevision(templateId,revision){return request<MailTemplate>({action:"restoreTemplateRevision",templateId,revision});},
  async deleteTemplate(id){await request({action:"deleteTemplate",id});},
  async listRoutes(){return request<MailRoute[]>({action:"listRoutes"});},
  async saveRoute(input){return request<MailRoute>({action:"saveRoute",input});},
  async deleteRoute(id){await request({action:"deleteRoute",id});},
  async listTriggers(){return request<MailTrigger[]>({action:"listTriggers"});},
  async getTrigger(eventKey){return request<MailTrigger|null>({action:"getTrigger",eventKey});},
  async saveTrigger(input){return request<MailTrigger>({action:"saveTrigger",input});},
  async deleteTrigger(id){await request({action:"deleteTrigger",id});},
  async getSettings(){return request<MailModuleSettings>({action:"getSettings"});},
  async saveSettings(input){return request<MailModuleSettings>({action:"saveSettings",input});}
 }),[]);
 async function onTestConnection(){
  const result=await request<{connected:boolean;senders:{id:string;address:string;display_name?:string|null}[];message:string}>({action:"testConnection"});
  return {...result,canSend:result.connected};
 }
 return <main className="portal-page"><div className="shell portal-shell brv-admin-page-inner"><div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> BUSINESS COMMUNICATIONS</p><h1>Mail System.</h1><p>Manage email templates, HTML content, sender routing, event triggers and module appearance.</p></div><MailModuleConsole store={store} onTestConnection={onTestConnection} canManage availableEvents={availableEvents}/></div></main>;
}
