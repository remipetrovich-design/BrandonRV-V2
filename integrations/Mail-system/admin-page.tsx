import {MailModuleConsole} from "./console";
import type {MailModuleStore} from "./types";
import {
 deleteTemplate,deleteRoute,deleteTrigger,listTemplates,listRoutes,listTriggers,
 getSettings,saveTemplate,listTemplateRevisions,restoreTemplateRevision,
 saveRoute,saveTrigger,saveSettings,testMailConnection,
} from "./actions";
import {CORE_INTEGRATION_EVENT_NAMES} from "@/lib/integration-events";
const store:MailModuleStore={
 listTemplates,
 getTemplateByKey:async(key)=>(await listTemplates()).find(item=>item.template_key===key)??null,
 saveTemplate,listTemplateRevisions,restoreTemplateRevision,deleteTemplate,
 listRoutes,saveRoute,deleteRoute,listTriggers,
 getTrigger:async(eventKey)=>(await listTriggers()).find(item=>item.event_key===eventKey)??null,
 saveTrigger,deleteTrigger,getSettings,saveSettings,
};
export default function MailSystemAdminPage(){
 return <main className="portal-page"><div className="shell portal-shell brv-admin-page-inner">
  <div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> INTEGRATION MODULE</p><h1>Mail System.</h1><p>Manage email templates, HTML content, revisions, sender routing, event triggers and delivery settings.</p></div>
  <MailModuleConsole store={store} onTestConnection={testMailConnection} canManage availableEvents={[...CORE_INTEGRATION_EVENT_NAMES]}/>
 </div></main>;
}
