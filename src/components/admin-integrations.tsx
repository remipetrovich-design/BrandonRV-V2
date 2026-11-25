"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Field = {
  key: string;
  label: string;
  type: "text" | "url" | "secret" | "boolean" | "number" | "select";
  required?: boolean;
  description?: string;
  options?: string[];
};
type Integration = {
  id: string;
  name: string;
  version: string;
  description: string;
  config: Field[];
  enabled: boolean;
  endpoint: string;
  settings: Record<string, unknown>;
  secretConfigured: Record<string, boolean>;
  updatedAt: string | null;
  events: string[];
};
type ConnectionCheck = {
  message: string;
  senders: { id: string; address: string }[];
};

export default function AdminIntegrations() {
  const router = useRouter();
  const [items, setItems] = useState<Integration[]>([]);
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});
  const [secrets, setSecrets] = useState<Record<string, Record<string, string>>>({});
  const [checks, setChecks] = useState<Record<string, ConnectionCheck>>({});
  const [expanded, setExpanded] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy("loading");
    try {
      const response = await fetch("/api/admin/integrations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load integrations.");
      const received = Array.isArray(data.integrations) ? data.integrations as Integration[] : [];
      const unique = Array.from(new Map<string, Integration>(received.map((item) => [item.id, item] as [string, Integration])).values());
      setItems(unique);
      setValues(Object.fromEntries(unique.map((item) => [item.id, { ...item.settings, endpoint: item.endpoint }])));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load integrations.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(item: Integration, enabled = item.enabled) {
    setBusy(item.id);
    setNotice("");
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          enabled,
          endpoint: values[item.id]?.endpoint ?? item.endpoint,
          settings: values[item.id] ?? {},
          secrets: secrets[item.id] ?? {},
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save integration.");
      setNotice(enabled ? "Integration enabled." : item.enabled ? "Integration disabled." : "Integration configuration saved.");
      setSecrets((current) => ({ ...current, [item.id]: {} }));
      await load();
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save integration.");
    } finally {
      setBusy("");
    }
  }

  async function test(item: Integration) {
    setBusy(item.id);
    setNotice("");
    try {
      const response = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? "Connection test failed.");
      const check = {
        message: data.message ?? "Connection test succeeded.",
        senders: Array.isArray(data.senders) ? data.senders : [],
      };
      setChecks((current) => ({ ...current, [item.id]: check }));
      setNotice(check.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed.";
      setChecks((current) => ({ ...current, [item.id]: { message, senders: [] } }));
      setNotice(message);
    } finally {
      setBusy("");
    }
  }

  function setValue(id: string, key: string, value: unknown) {
    setValues((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  return (
    <section className="brv-integrations-manager" aria-label="Installed integrations">
      <header className="brv-integrations-summary">
        <div>
          <span className="panel-kicker">MODULE DISCOVERY</span>
          <h2>{items.length} installed {items.length === 1 ? "integration" : "integrations"}</h2>
          <p>
            Modules are discovered from folders directly inside <code>/integrations</code>. Add a module folder with a valid <code>integration.json</code> manifest to make it appear here.
          </p>
        </div>
        <button className="button button-secondary" type="button" disabled={!!busy} onClick={() => void load()}>
          ↻ Refresh modules
        </button>
      </header>

      {notice && <p className="inline-notice" role="status">{notice}</p>}
      {busy === "loading" ? (
        <p className="panel-footnote">Scanning installed modules…</p>
      ) : items.length === 0 ? (
        <section className="portal-panel brv-integrations-empty">
          <span className="panel-kicker">NO MODULES INSTALLED</span>
          <h3>No integrations found.</h3>
          <p>The integration manager is ready. When a module is installed in its own folder under <code>/integrations</code>, it will appear here automatically with its configuration fields.</p>
          <p>No sample or placeholder integrations are included in the core application.</p>
        </section>
      ) : (
        <div className="brv-integrations-list">
          {items.map((item) => (
            <article className="portal-panel brv-integration-card" key={item.id}>
              <header className="brv-integration-card__header">
                <div>
                  <span className="panel-kicker">VERSION {item.version}</span>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  {item.events.length > 0 && <small>Subscribed events: {item.events.join(", ")}</small>}
                </div>
                <span className={"status-pill " + (item.enabled ? "status-pill-success" : "status-pill-draft")}>
                  {item.enabled ? "Enabled" : "Disabled"}
                </span>
              </header>

              <div className="brv-integration-card__actions">
                <button className="button button-secondary" type="button" onClick={() => setExpanded(expanded === item.id ? "" : item.id)}>
                  {expanded === item.id ? "Close configuration" : "Configure"}
                </button>
                <button className="button button-primary" type="button" disabled={!!busy} onClick={() => void save(item, !item.enabled)}>
                  {busy === item.id ? "Saving…" : item.enabled ? "Disable integration" : "Enable integration"}
                </button>
              </div>

              {expanded === item.id && (
                <div className="brv-integration-config">
                  <label>
                    Endpoint URL
                    <input
                      type="url"
                      value={String(values[item.id]?.endpoint ?? "")}
                      onChange={(event) => setValue(item.id, "endpoint", event.target.value)}
                      placeholder="https://…"
                    />
                  </label>

                  {item.config.map((field) => (
                    <label key={field.key}>
                      {field.label}
                      {field.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(values[item.id]?.[field.key])}
                          onChange={(event) => setValue(item.id, field.key, event.target.checked)}
                        />
                      ) : field.type === "select" ? (
                        <select
                          value={String(values[item.id]?.[field.key] ?? "")}
                          onChange={(event) => setValue(item.id, field.key, event.target.value)}
                        >
                          <option value="">Select…</option>
                          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          type={field.type === "secret" ? "password" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                          value={field.type === "secret" ? secrets[item.id]?.[field.key] ?? "" : String(values[item.id]?.[field.key] ?? "")}
                          placeholder={field.type === "secret" ? item.secretConfigured[field.key] ? "Configured — enter a new value to replace" : "Not configured" : ""}
                          onChange={(event) => {
                            if (field.type === "secret") {
                              setSecrets((current) => ({ ...current, [item.id]: { ...current[item.id], [field.key]: event.target.value } }));
                            } else {
                              setValue(item.id, field.key, field.type === "number" ? Number(event.target.value) : event.target.value);
                            }
                          }}
                        />
                      )}
                      {field.description && <small>{field.description}</small>}
                    </label>
                  ))}

                  <p className="brv-integration-secret-note">Secret values are encrypted before storage and are never displayed after saving.</p>

                  {checks[item.id] && (
                    <section className="brv-integration-connection-result" aria-live="polite">
                      <p>{checks[item.id].message}</p>
                      {checks[item.id].senders.length > 0 ? (
                        <>
                          <strong>Permitted sender mailboxes</strong>
                          <ul>{checks[item.id].senders.map((sender) => <li key={sender.id}>{sender.address}</li>)}</ul>
                          {item.id === "mail-system" && (
                            <p>Choose a default sender or routing sender in the <a href="/admin/integrations/mail-system">Mail System configuration page</a>.</p>
                          )}
                        </>
                      ) : (
                        <p>No sender mailboxes were returned by this connection test.</p>
                      )}
                    </section>
                  )}

                  <div className="brv-integration-card__actions">
                    <button className="button button-secondary" type="button" disabled={!!busy} onClick={() => void test(item)}>
                      {busy === item.id ? "Working…" : "Test connection"}
                    </button>
                    <button className="button button-primary" type="button" disabled={!!busy} onClick={() => void save(item, item.enabled)}>
                      {busy === item.id ? "Saving…" : "Save configuration"}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
