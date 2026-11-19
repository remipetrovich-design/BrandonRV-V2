import { getMailSystemSenders } from "./mail-configuration";

export type MailConfigurationTemplate = {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  active?: boolean;
};

export async function MailConfigurationPage({
  applicationName,
  templates = [],
  defaultSender = "",
  saveSettingsAction,
  saveTemplateAction,
  deleteTemplateAction,
  templatesHref,
}: {
  applicationName: string;
  templatesHref?: string;
  templates?: MailConfigurationTemplate[];
  defaultSender?: string;
  saveSettingsAction?: (formData: FormData) => Promise<void>;
  saveTemplateAction?: (formData: FormData) => Promise<void>;
  deleteTemplateAction?: (formData: FormData) => Promise<void>;
}) {
  let connection: { sender: string | null; senders: { id: string; address: string }[] } | null = null;
  let error = "";
  try {
    connection = await getMailSystemSenders();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not connect to Mail System.";
  }
  return (
    <section className="mail-configuration-panel">
      <header>
        <p className="mail-configuration-eyebrow">APPLICATION MAIL</p>
        <h2>Mail Configuration</h2>
        <p>Configure the connection between {applicationName} and the central Mail System.</p>
      </header>
      <div className="mail-configuration-status" role="status">
        <strong>{connection ? "Connected" : "Not connected"}</strong>
        <span>{connection ? "The server-side integration key is accepted." : error}</span>
      </div>
      {connection && <>
        <h3>Authorized sender mailboxes</h3>
        {connection.senders.length ? <ul>{connection.senders.map(sender =>
          <li key={sender.id}>{sender.address}{sender.address === (defaultSender || connection?.sender) ? " · Default sender" : ""}</li>
        )}</ul> : <p>No active sender mailboxes have been assigned to this application.</p>}
        {saveSettingsAction && <form action={saveSettingsAction} className="mail-configuration-form">
          <h3>Application mail settings</h3>
          <label>Default sender<select name="defaultSender" defaultValue={defaultSender || connection.sender || ""} required>
            {connection.senders.map(sender => <option key={sender.id} value={sender.address}>{sender.address}</option>)}
          </select></label>
          <button type="submit">Save mail settings</button>
        </form>}
      </>}
      <section className="mail-configuration-templates">
        <h3>Email templates</h3>
        <p>Templates, variables and trigger logic are stored by {applicationName}; Mail System handles delivery.</p>
        {templates.length ? <ul>{templates.map(template => <li key={template.id}>
          <strong>{template.name}</strong> · {template.key} · {template.subject}
          {template.active === false ? " · Disabled" : ""}
          {deleteTemplateAction && <form action={deleteTemplateAction}><input type="hidden" name="id" value={template.id} /><button type="submit">Delete</button></form>}
        </li>)}</ul> : <p>No application email templates configured.</p>}
        {templatesHref && <a href={templatesHref}>Open the application's full template manager →</a>}
        {saveTemplateAction && <form action={saveTemplateAction} className="mail-configuration-form">
          <h4>Add or update a template</h4>
          <label>Template key<input name="key" required maxLength={100} /></label>
          <label>Name<input name="name" required maxLength={150} /></label>
          <label>Subject<input name="subject" required maxLength={255} /></label>
          <label>Message body<textarea name="body" rows={6} required /></label>
          <button type="submit">Save template</button>
        </form>}
      </section>
      <footer><p>Connection credentials are read from server environment variables. The API key is never sent to the browser.</p></footer>
    </section>
  );
}
