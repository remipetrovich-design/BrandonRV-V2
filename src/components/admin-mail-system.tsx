"use client";

import { useMemo } from "react";
import { MailModuleConsole } from "@/integrations/Mail-system/console";
import type { MailModuleStore } from "@/integrations/Mail-system/types";

async function request(action: string, data: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/mail-system", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || "Mail System request failed.");
  return result.data;
}

export default function AdminMailSystem() {
  const store = useMemo<MailModuleStore>(() => ({
    listTemplates: () => request("listTemplates"),
    getTemplateByKey: (key) => request("getTemplateByKey", { key }),
    saveTemplate: (input) => request("saveTemplate", { input }),
    listTemplateRevisions: (templateId) => request("listTemplateRevisions", { templateId }),
    restoreTemplateRevision: (templateId, revision) => request("restoreTemplateRevision", { templateId, revision }),
    deleteTemplate: (id) => request("deleteTemplate", { id }),
    listRoutes: () => request("listRoutes"),
    saveRoute: (input) => request("saveRoute", { input }),
    deleteRoute: (id) => request("deleteRoute", { id }),
    listTriggers: () => request("listTriggers"),
    getTrigger: (eventKey) => request("getTrigger", { eventKey }),
    saveTrigger: (input) => request("saveTrigger", { input }),
    deleteTrigger: (id) => request("deleteTrigger", { id }),
    getSettings: () => request("getSettings"),
    saveSettings: (input) => request("saveSettings", { input }),
  }), []);

  return (
    <MailModuleConsole
      store={store}
      canManage
      onTestConnection={async () => request("testConnection")}
    />
  );
}
