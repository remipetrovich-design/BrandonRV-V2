import { authorizePermission, database, jsonError, sameOrigin } from "@/lib/auth";
import { decryptIntegrationSecrets } from "@/lib/integration-secrets";
import { createSupabaseMailModuleStore } from "../../../../../integrations/Mail-system/supabase-store";
import {
  configureTemplate, configureRoute, configureTrigger, updateModuleSettings,
} from "../../../../../integrations/Mail-system/configuration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type DatabaseClient = ReturnType<typeof database>;

async function authorize(): Promise<{ db: DatabaseClient | null; response: Response | null }> {
  const access = await authorizePermission("integrations.manage");
  if (access.response) return { db: null, response: access.response };
  const db = database();
  const { data, error } = await db.from("app_integrations").select("active").eq("slug", "mail-system").maybeSingle();
  if (error) return { db: null, response: jsonError("Could not verify Mail System integration status.", 500) };
  if (data?.active !== true) return { db: null, response: jsonError("Enable the Mail System integration before opening its configuration.", 409) };
  return { db, response: null };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const access = await authorize();
  if (access.response || !access.db) return access.response || jsonError("Not authorised.", 403);
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const db = access.db;
    const store = createSupabaseMailModuleStore(db);
    let data: unknown;

    switch (action) {
      case "listTemplates": data = await store.listTemplates(); break;
      case "getTemplateByKey": data = await store.getTemplateByKey(String(body.key || "")); break;
      case "saveTemplate": data = await configureTemplate(store, body.input); break;
      case "listTemplateRevisions": data = await store.listTemplateRevisions(String(body.templateId || "")); break;
      case "restoreTemplateRevision": data = await store.restoreTemplateRevision(String(body.templateId || ""), Number(body.revision)); break;
      case "deleteTemplate": await store.deleteTemplate(String(body.id || "")); data = { deleted: true }; break;
      case "listRoutes": data = await store.listRoutes(); break;
      case "saveRoute": data = await configureRoute(store, body.input); break;
      case "deleteRoute": await store.deleteRoute(String(body.id || "")); data = { deleted: true }; break;
      case "listTriggers": data = await store.listTriggers(); break;
      case "getTrigger": data = await store.getTrigger(String(body.eventKey || "")); break;
      case "saveTrigger": data = await configureTrigger(store, body.input); break;
      case "deleteTrigger": await store.deleteTrigger(String(body.id || "")); data = { deleted: true }; break;
      case "getSettings": data = await store.getSettings(); break;
      case "saveSettings": data = await updateModuleSettings(store, body.input); break;
      case "testConnection": {
        const { data: row, error } = await db.from("app_integrations")
          .select("endpoint,secret").eq("slug", "mail-system").maybeSingle();
        if (error || !row) return jsonError("Mail System connection configuration is unavailable.", 500);
        const endpoint = String(row.endpoint || "").trim().replace(/\/+$/, "");
        const apiKey = row.secret ? decryptIntegrationSecrets(row.secret).apiKey : "";
        if (!/^https:\/\//i.test(endpoint) || !apiKey) return jsonError("Configure the HTTPS endpoint and Mail System API key in Integrations first.", 400);
        const response = await fetch(endpoint + "/api/mail/senders", {
          headers: { Authorization: "Bearer " + apiKey },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = response.status === 401 ? "Mail System rejected the API key." :
            response.status === 403 ? "The External System is inactive or the key does not have the mail:send scope." :
            (typeof result.error === "string" ? result.error : "Mail System connection failed (" + response.status + ").");
          return Response.json({ error: message }, { status: 502 });
        }
        const senders = Array.isArray(result.senders) ? result.senders.filter((sender: any) =>
          sender && typeof sender.id === "string" && typeof sender.address === "string" && emailPattern.test(sender.address)
        ).map((sender: any) => ({ id: sender.id, address: sender.address, display_name: sender.display_name || null })) : [];
        data = { connected: senders.length > 0, senders, message: senders.length
          ? "Connected. " + senders.length + " permitted sender mailbox(es) available."
          : "Connected, but no active sender mailbox is assigned to this External System." };
        break;
      }
      default: return jsonError("Unknown Mail System operation.", 400);
    }
    return Response.json({ success: true, data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Mail System operation failed.", 400);
  }
}
