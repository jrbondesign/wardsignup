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
 * transactional mail. This is the plan ceiling, not a remaining balance and
 * not a default. A dashboard snapshot (including 288 left at 09:05 MST on
 * 8 Nov 2026) is stale the moment it is read and is not stored here.
 * The cap and the already-used seed must both be set explicitly at
 * enablement. Either one missing, `unknown`, or not an integer refuses the
 * send. Values above the free ceiling are clamped so this path cannot aim
 * at a paid quota.
 */
export const BREVO_FREE_PLAN_DAILY_RECIPIENTS = 300;

/**
 * Legacy cumulative window id from #147. Still used when BREVO_QUOTA_WINDOW_ID
 * is set but malformed, so a bad override keeps counting against a known row
 * instead of opening a fresh one.
 */
export const BREVO_QUOTA_WINDOW_UNCONFIRMED = "unconfirmed-reset";

/**
 * Prefix for the derived daily window. Brevo's free-plan daily limit resets
 * at 00:00 UTC (17:00 MST), so the window is the UTC calendar date.
 */
export const BREVO_DAILY_WINDOW_PREFIX = "utc-";

/** UTC calendar date as YYYY-MM-DD. */
export function utcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function brevoRecipientCap(env: Env = process.env): number | null {
  const raw = env.BREVO_DAILY_RECIPIENT_CAP?.trim().toLowerCase();
  if (raw === undefined || raw === "" || raw === "unknown") return null;
  const n = Number(env.BREVO_DAILY_RECIPIENT_CAP);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, BREVO_FREE_PLAN_DAILY_RECIPIENTS);
}

/**
 * Recipients already consumed on this Brevo account when the window opens,
 * including marketing and any other sender. Unset does not mean zero: it
 * refuses Brevo sends (the kill switch in docs/EMAIL_CUTOVER.md) for every
 * window, daily or overridden. This is the raw validated value. Use
 * `brevoWindowSeed` for the figure applied to a given window.
 */
export function brevoQuotaSeed(env: Env = process.env): number | null {
  const raw = env.BREVO_QUOTA_USED_AT_OPEN?.trim().toLowerCase();
  if (raw === undefined || raw === "" || raw === "unknown") return null;
  const n = Number(env.BREVO_QUOTA_USED_AT_OPEN);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Valid BREVO_QUOTA_WINDOW_ID override, or null when unset or malformed. */
function windowOverride(env: Env): { set: boolean; id: string | null } {
  const id = env.BREVO_QUOTA_WINDOW_ID?.trim();
  if (!id) return { set: false, id: null };
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) return { set: true, id: null };
  return { set: true, id };
}

/**
 * Quota window for a send at `now`.
 * - BREVO_QUOTA_WINDOW_ID set and valid: that id, cumulative, never rolls.
 * - Set but malformed: the legacy `unconfirmed-reset` row (fail toward counting).
 * - Unset: `utc-YYYY-MM-DD`, so a new UTC day opens a new row at Brevo's reset.
 */
export function brevoWindowKey(env: Env = process.env, now: Date = new Date()): string {
  const o = windowOverride(env);
  if (o.id) return o.id;
  if (o.set) return BREVO_QUOTA_WINDOW_UNCONFIRMED;
  return `${BREVO_DAILY_WINDOW_PREFIX}${utcDateString(now)}`;
}

/** True when the window key comes from the UTC date rather than an override. */
export function isDailyBrevoWindow(env: Env = process.env): boolean {
  return !windowOverride(env).set;
}

/**
 * Seed applied when `windowKey`'s row is first written.
 * - Override or legacy window: BREVO_QUOTA_USED_AT_OPEN, exactly as in #147.
 * - Daily window: BREVO_QUOTA_USED_AT_OPEN only on the UTC date named by
 *   BREVO_QUOTA_USED_AT_OPEN_DATE (YYYY-MM-DD). Every other day starts at 0,
 *   because Brevo's counter has just reset. Other senders on the account
 *   later that day stay invisible until Brevo rejects for quota, which
 *   latches only that day's row.
 * Either way, a missing or invalid BREVO_QUOTA_USED_AT_OPEN returns null and
 * the send is refused.
 */
export function brevoWindowSeed(env: Env, windowKey: string): number | null {
  const seed = brevoQuotaSeed(env);
  if (seed === null) return null;
  if (!isDailyBrevoWindow(env)) return seed;
  const day = env.BREVO_QUOTA_USED_AT_OPEN_DATE?.trim();
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && windowKey === `${BREVO_DAILY_WINDOW_PREFIX}${day}`) {
    return seed;
  }
  return 0;
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
