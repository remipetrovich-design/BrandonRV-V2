export type MailSender = { id: string; address: string; display_name?: string | null };

export type MailTemplate = {
  id: string;
  template_key: string;
  display_name: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  variables: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MailRoute = {
  id: string;
  route_key: string;
  sender_address: string;
  priority: number;
  conditions: Record<string, unknown>;
  active: boolean;
};

export type MailTrigger = {
  id: string;
  event_key: string;
  template_key: string;
  route_key: string | null;
  recipient_mapping: Record<string, unknown>;
  active: boolean;
};

export type MailAppearance = {
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: string;
  fontFamily: string;
  logoUrl?: string;
  title: string;
  subtitle: string;
};

export type MailEmailLayout = { html: string; css: string };
export type MailModuleSettings = {
  enabled: boolean;
  defaultSender: string | null;
  appearance: MailAppearance;
  emailLayout?: MailEmailLayout;
};

export type MailTemplateRevision = {
  id: string;
  template_id: string;
  revision: number;
  snapshot: MailTemplate;
  created_at: string;
};

export type MailModuleCapabilities = {
  connected: boolean;
  canSend: boolean;
  senders: MailSender[];
  defaultSender: string | null;
  error?: string;
  status?: "connected" | "no_senders_assigned" | "invalid_api_key" | "external_system_or_scope_invalid" | "configuration_missing" | "mail_system_unavailable" | "network_error" | "unknown_error";
  message?: string;
};

/**
 * Host-owned persistence contract. saveTemplate MUST update the template and
 * insert its next revision snapshot in one database transaction.
 */
export type MailModuleStore = {
  listTemplates(): Promise<MailTemplate[]>;
  getTemplateByKey(key: string): Promise<MailTemplate | null>;
  saveTemplate(input: Omit<MailTemplate, "id" | "created_at" | "updated_at"> & { id?: string }): Promise<MailTemplate>;
  listTemplateRevisions(templateId: string): Promise<MailTemplateRevision[]>;
  restoreTemplateRevision(templateId: string, revision: number): Promise<MailTemplate>;
  deleteTemplate(id: string): Promise<void>;
  listRoutes(): Promise<MailRoute[]>;
  saveRoute(input: Omit<MailRoute, "id"> & { id?: string }): Promise<MailRoute>;
  deleteRoute(id: string): Promise<void>;
  listTriggers(): Promise<MailTrigger[]>;
  getTrigger(eventKey: string): Promise<MailTrigger | null>;
  saveTrigger(input: Omit<MailTrigger, "id"> & { id?: string }): Promise<MailTrigger>;
  deleteTrigger(id: string): Promise<void>;
  getSettings(): Promise<MailModuleSettings>;
  saveSettings(input: MailModuleSettings): Promise<MailModuleSettings>;
};

export const defaultEmailLayout: MailEmailLayout = { html: "<table role=\"presentation\" width=\"100%\" class=\"email-wrapper\"><tbody><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\" class=\"email-container\"><tbody><tr><td class=\"header\"><img src=\"{{logoUrl}}\" alt=\"Brandon RV\" class=\"logo\"></td></tr><tr><td class=\"header-divider\">&nbsp;</td></tr><tr><td class=\"content\">{{content}}</td></tr><tr><td class=\"footer\"><table role=\"presentation\" width=\"100%\" class=\"footer-columns\"><tbody><tr><td class=\"footer-column\"><h3 class=\"footer-heading\">Information</h3><p class=\"footer-text\">Brandon RV</p><p class=\"footer-text\">Tamworth, NSW</p></td><td class=\"footer-column\"><h3 class=\"footer-heading\">About Us</h3><p class=\"footer-text\">From Factory Experience to Repairs On The Go</p></td><td class=\"footer-column\"><h3 class=\"footer-heading\">Contact</h3><p class=\"footer-text\"><a href=\"tel:0437985190\">0437 985 190</a></p><p class=\"footer-text\"><a href=\"mailto:brandon@brandonrv.trade\">brandon@brandonrv.trade</a></p></td></tr></tbody></table><div class=\"footer-bottom\"><p>Brandon RV | Tamworth, NSW</p><p>© Brandon RV. All rights reserved.</p></div></td></tr></tbody></table></td></tr></tbody></table>", css: "body{margin:0;padding:0;background-color:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#333333}table{border-collapse:collapse;border-spacing:0}.email-wrapper{width:100%;padding:30px 12px;background-color:#f2f3f5}.email-container{width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:6px;overflow:hidden}.header{padding:30px 25px;text-align:center;background-color:#ffffff}.logo{display:block;width:100%;max-width:230px;height:auto;margin:0 auto;border:0}.header-divider{height:4px;background-color:#263746;line-height:4px;font-size:0}.content{padding:35px 30px;background-color:#ffffff;font-size:15px;line-height:1.7;color:#333333}.footer{padding:30px 25px 20px;background-color:#263746;color:#ffffff}.footer-columns{width:100%}.footer-column{width:33.33%;padding:0 10px;vertical-align:top}.footer-heading{margin:0 0 12px;font-size:14px;font-weight:bold;color:#ffffff}.footer-text{margin:0 0 8px;font-size:12px;line-height:1.6;color:#d9e0e5}.footer a{color:#d9e0e5;text-decoration:none}.footer a:hover{color:#ffffff;text-decoration:underline}.footer-bottom{margin-top:24px;padding-top:18px;border-top:1px solid #52616d;text-align:center}.footer-bottom p{margin:0 0 6px;font-size:11px;line-height:1.6;color:#c5cdd3}@media screen and (max-width:480px){.email-wrapper{padding:15px 8px}.header{padding:25px 15px}.content{padding:25px 20px}.footer{padding:25px 20px 18px}.footer-column{display:block;width:100%;padding:0 0 20px}.footer-column:last-child{padding-bottom:0}}" };

export const defaultAppearance: MailAppearance = {
  primaryColor: "#253858",
  accentColor: "#3978d4",
  surfaceColor: "#ffffff",
  textColor: "#172033",
  borderColor: "#d9e0ea",
  borderRadius: "12px",
  fontFamily: "inherit",
  title: "Mail settings",
  subtitle: "Configure application email",
};
