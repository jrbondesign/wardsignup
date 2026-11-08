type Env = Record<string, string | undefined>;

/**
 * Explicit rollout gate. Unset, "resend", or any other value keeps today's
 * Resend-first path (including the existing bulk Brevo route). Only the exact
 * value "brevo" selects the cutover. The sending key is a separate check:
 * this flag alone never reads BREVO_API_KEY, an MCP token, or an SMTP password.
 */
export function isBrevoCutoverEnabled(env: Env = process.env): boolean {
  return env.EMAIL_PROVIDER_CUTOVER?.trim().toLowerCase() === "brevo";
}

/** HTTP api-key for the cutover. Never falls back to BREVO_API_KEY. */
export function wardsignupBrevoApiKey(env: Env = process.env): string | null {
  const key = env.WARDSIGNUP_BREVO_API_KEY?.trim();
  return key || null;
}

/**
 * Verified Brevo free plan: 300 emails/day, shared by marketing and
 * transactional mail. This is the plan ceiling, not a remaining balance.
 * A dashboard snapshot of leftover sends is not a default and is not stored.
 * `unknown`, zero, or a non-integer refuses the send (quota state unknown).
 * Values above the free ceiling are clamped so this path cannot aim at a
 * paid quota.
 */
export const BREVO_FREE_PLAN_DAILY_RECIPIENTS = 300;

/** Window id until someone confirms Brevo's reset and chooses a new one. */
export const BREVO_QUOTA_WINDOW_UNCONFIRMED = "unconfirmed-reset";

export function brevoRecipientCap(env: Env = process.env): number | null {
  const raw = env.BREVO_DAILY_RECIPIENT_CAP?.trim().toLowerCase();
  if (raw === undefined) return BREVO_FREE_PLAN_DAILY_RECIPIENTS;
  if (raw === "" || raw === "unknown") return null;
  const n = Number(env.BREVO_DAILY_RECIPIENT_CAP);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, BREVO_FREE_PLAN_DAILY_RECIPIENTS);
}

export function brevoWindowKey(env: Env = process.env): string {
  const id = env.BREVO_QUOTA_WINDOW_ID?.trim() || BREVO_QUOTA_WINDOW_UNCONFIRMED;
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) return BREVO_QUOTA_WINDOW_UNCONFIRMED;
  return id;
}

/** One API call must not be able to consume the day. */
export const MAX_RECIPIENTS_PER_SEND = 20;

/**
 * Brevo counts each envelope recipient, including a batch on one request.
 * Comma-separated addresses count separately. Duplicates are not collapsed:
 * the provider counts each recipient slot.
 */
/** Tag Brevo will echo. Not an email address and not the raw idempotency key. */
export function idempotencyTag(key: string): string {
  return `k${key.replace(/[^A-Za-z0-9]/g, "").slice(0, 40)}`;
}

export function countEnvelopeRecipients(to: string, extra: string[] = []): number {
  return [to, ...extra]
    .flatMap((part) => part.split(/[,;]/))
    .map((part) => part.trim())
    .filter((part) => part.includes("@")).length;
}
