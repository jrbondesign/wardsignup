import { idempotencyTag } from "@/lib/email-cutover-config";
import { WARD_SIGNUP_FROM_EMAIL } from "@/lib/email-from-policy";
import type { ProviderHttpResult } from "@/lib/email-brevo-classify";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export type BrevoSendInput = {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  idempotencyKey: string;
  attachments?: Array<{ filename: string; content: string }>;
  timeoutMs?: number;
};

/**
 * POST /v3/smtp/email. The api-key header is only the value passed in
 * (WARDSIGNUP_BREVO_API_KEY). This function does not read SMTP passwords,
 * MCP tokens, or BREVO_API_KEY. A sender other than jonathan@wardsignup.com
 * is refused before fetch.
 */
export async function postBrevoTransactional(
  input: BrevoSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderHttpResult> {
  const senderEmail = input.senderEmail.trim().toLowerCase();
  if (senderEmail !== WARD_SIGNUP_FROM_EMAIL) {
    return { status: null, body: "refused from", messageId: null, localRefusal: "from" };
  }
  const body: Record<string, unknown> = {
    sender: { email: senderEmail, name: input.senderName },
    to: input.to.map((email) => ({ email })),
    subject: input.subject,
    htmlContent: input.html,
    ...(input.text ? { textContent: input.text } : {}),
    ...(input.replyTo && input.replyTo.toLowerCase() !== senderEmail ? { replyTo: { email: input.replyTo } } : {}),
    ...(input.attachments?.length
      ? { attachment: input.attachments.map((file) => ({ name: file.filename, content: file.content })) }
      : {}),
    headers: { ...(input.headers ?? {}), "X-WardSignup-Idempotency": input.idempotencyKey },
    tags: ["wardsignup", idempotencyTag(input.idempotencyKey)],
  };
  const timeoutMs = input.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": input.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    const resetRaw = res.headers.get("x-sib-ratelimit-reset");
    const reset = resetRaw != null && Number.isFinite(Number(resetRaw)) ? Number(resetRaw) : null;
    let messageId: string | null = null;
    try {
      const json = JSON.parse(text) as { messageId?: unknown; messageIds?: unknown };
      if (typeof json.messageId === "string" && json.messageId.trim()) messageId = json.messageId.trim();
      else if (Array.isArray(json.messageIds) && typeof json.messageIds[0] === "string") {
        messageId = json.messageIds[0].trim() || null;
      }
    } catch {
      messageId = null;
    }
    return { status: res.status, body: text.slice(0, 500), messageId, rateLimitResetSeconds: reset };
  } catch (e) {
    const aborted = controller.signal.aborted;
    const why = aborted ? `timed out after ${timeoutMs}ms` : e instanceof Error ? e.message : String(e);
    return { status: null, body: why.slice(0, 300), messageId: null };
  } finally {
    clearTimeout(timer);
  }
}
