export type MailSystemSender = { id: string; address: string };
export type MailSystemMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from_address?: string;
  reply_to?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: { filename: string; content: string; content_type?: string }[];
};
export type MailSystemConfig = { baseUrl: string; apiKey: string };

export function getMailSystemConfig(env: NodeJS.ProcessEnv = process.env): MailSystemConfig {
  const baseUrl = String(env.MAIL_SYSTEM_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(env.MAIL_SYSTEM_API_KEY || "").trim();
  if (!baseUrl || !/^https:\/\//i.test(baseUrl)) throw new Error("MAIL_SYSTEM_URL must be a valid HTTPS URL.");
  if (!apiKey) throw new Error("MAIL_SYSTEM_API_KEY is not configured.");
  return { baseUrl, apiKey };
}

async function mailRequest<T>(path: string, init: RequestInit = {}, config = getMailSystemConfig()): Promise<T> {
  const response = await fetch(config.baseUrl + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + config.apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Mail System request failed (" + response.status + ").");
  return result as T;
}

export async function getMailSystemSenders(config = getMailSystemConfig()) {
  const result = await mailRequest<{ sender: string | null; senders: MailSystemSender[] }>("/api/mail/senders", {}, config);
  return result;
}

export async function testMailSystemConnection(config = getMailSystemConfig()) {
  const result = await getMailSystemSenders(config);
  return { connected: true, defaultSender: result.sender, senders: result.senders };
}

export async function sendMailSystemMessage(message: MailSystemMessage, config = getMailSystemConfig()) {
  const senders = await getMailSystemSenders(config);
  const sender = message.from_address || senders.sender;
  if (!sender) throw new Error("No active sender mailbox is assigned to this application.");
  if (!senders.senders.some(item => item.address.toLowerCase() === sender.toLowerCase())) {
    throw new Error("The requested sender is not assigned to this application.");
  }
  return mailRequest<{ ok: boolean; id: string; providerId?: string }>("/api/mail", {
    method: "POST",
    body: JSON.stringify({ ...message, from_address: sender }),
  }, config);
}
