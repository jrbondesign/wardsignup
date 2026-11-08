/**
 * Brevo HTTP classification for the cutover.
 *
 * 429 on POST /v3/smtp/email is the API rate limit (x-sib-ratelimit-*), not
 * the free daily email quota. Daily quota / credit failures are a different
 * rejection (`not_enough_credits` and the phrases below). A timeout, a 5xx,
 * or a 2xx without a message id is ambiguous: Brevo may already have accepted
 * the message, and Brevo does not enforce an idempotency key. Those outcomes
 * must not fall back to Resend.
 */

export type ProviderHttpResult = {
  status: number | null;
  body: string;
  messageId?: string | null;
  rateLimitResetSeconds?: number | null;
  /** Set when this process refused the call before any network IO. */
  localRefusal?: "from" | "no_key";
};

export type BrevoClass =
  | { kind: "accepted"; messageId: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "quota"; detail: string }
  | { kind: "auth"; detail: string }
  | { kind: "permanent"; detail: string };

const QUOTA_CODES = new Set([
  "not_enough_credits",
  "insufficient credits",
  "insufficient_credits",
  "message_limit_reached",
  "quota_exceeded",
]);

function parsed(body: string): { code: string; message: string } {
  try {
    const json = JSON.parse(body) as { code?: unknown; message?: unknown };
    return {
      code: typeof json.code === "string" ? json.code.toLowerCase() : "",
      message: typeof json.message === "string" ? json.message : body,
    };
  } catch {
    return { code: "", message: body };
  }
}

function looksLikeQuota(code: string, message: string): boolean {
  if (QUOTA_CODES.has(code)) return true;
  return /daily limit|quota|not enough credits|insufficient credits|message limit/i.test(`${code} ${message}`);
}

/** A 4xx that names the sender. Recipient validation ("email is not valid") is not this. */
function looksLikeSenderFailure(code: string, message: string): boolean {
  return /sender|from address|not verified|unverified|smtp account is not yet activated/i.test(`${code} ${message}`);
}

export function classifyBrevoHttp(result: ProviderHttpResult): BrevoClass {
  if (result.localRefusal === "from") {
    return { kind: "auth", detail: "local refusal: from" };
  }
  if (result.localRefusal) {
    return { kind: "permanent", detail: `local refusal: ${result.localRefusal}` };
  }
  if (result.status === null || result.status >= 500) {
    return { kind: "ambiguous", reason: result.status === null ? "no response" : `http ${result.status}` };
  }
  if (result.status === 201 || result.status === 202) {
    const messageId = result.messageId?.trim();
    if (messageId) return { kind: "accepted", messageId };
    return { kind: "ambiguous", reason: `http ${result.status} without message id` };
  }
  const { code, message } = parsed(result.body);
  const detail = `${result.status} ${code} ${message}`.trim().slice(0, 300);
  if (result.status === 429) {
    if (looksLikeQuota(code, message)) return { kind: "quota", detail };
    return { kind: "rate_limited", retryAfterSeconds: result.rateLimitResetSeconds ?? null };
  }
  if (result.status === 402 || looksLikeQuota(code, message)) return { kind: "quota", detail };
  if (code === "duplicate_request") return { kind: "ambiguous", reason: "duplicate_request" };
  if (result.status === 401 || result.status === 403) return { kind: "auth", detail };
  if (looksLikeSenderFailure(code, message)) return { kind: "auth", detail };
  return { kind: "permanent", detail };
}

export type ResendClass =
  | { kind: "accepted"; messageId: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "quota"; detail: string }
  | { kind: "permanent"; detail: string };

/** One Resend attempt. Network loss and 5xx stay ambiguous so nothing else is tried. */
export function classifyResendFallback(result: ProviderHttpResult): ResendClass {
  if (result.status === null || result.status >= 500) {
    return { kind: "ambiguous", reason: result.status === null ? "no response" : `http ${result.status}` };
  }
  if (result.status >= 200 && result.status < 300) {
    const messageId = result.messageId?.trim();
    if (messageId) return { kind: "accepted", messageId };
    return { kind: "ambiguous", reason: "resend accepted without message id" };
  }
  const { code, message } = parsed(result.body);
  const detail = `${result.status} ${code} ${message}`.trim().slice(0, 300);
  if (result.status === 429 || looksLikeQuota(code, message)) return { kind: "quota", detail };
  return { kind: "permanent", detail };
}
