import { createHash } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getResendForBrand } from "@/lib/resend-for-brand";
import type { PublicBrand } from "@/lib/brand/types";
import { phoenixDayStartUtc } from "@/lib/phoenix-time";

/**
 * Low level delivery: Resend first, Brevo as a free fallback.
 *
 * Two daily counters, both must have room:
 * - Arizona day budget (00:00 to 23:59 America/Phoenix): RESEND_DAILY_SOFT_LIMIT,
 *   default 90. This is "the day" for us, like everything else in docs/TIME_ZONES.md.
 * - UTC day safety cap: Resend's free plan allows 100 emails per UTC day and
 *   resets at 00:00 UTC (5 PM Arizona), which we can't move. One Arizona day
 *   spans two Resend days, so the Arizona budget alone could let up to twice
 *   the limit land in one Resend day. RESEND_UTC_DAY_CAP (default: the soft
 *   limit) keeps us under Resend's real quota. It keeps the counter key the
 *   old UTC budget used, so nothing resets on deploy.
 * Once either is used up, or Resend answers 429, urgent mail goes through Brevo
 * instead. Brevo does nothing until EMAIL_FALLBACK_PROVIDER=brevo, BREVO_API_KEY
 * and BREVO_SENDER_EMAIL are set.
 */

export type DeliverParams = {
  brand: PublicBrand;
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string }>;
  headers?: Record<string, string>;
};

export type DeliverResult =
  | { ok: true; provider: "resend" | "brevo" }
  | { ok: false; error: string; overBudget?: boolean };

type Env = Record<string, string | undefined>;

export function resendDailySoftLimit(env: Env = process.env): number {
  const n = Number(env.RESEND_DAILY_SOFT_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 90;
}

/** Resend UTC day safety cap. Defaults to the soft limit, never above Resend's 100. */
export function resendUtcDayCap(env: Env = process.env): number {
  const n = Number(env.RESEND_UTC_DAY_CAP);
  const cap = Number.isInteger(n) && n > 0 ? n : resendDailySoftLimit(env);
  return Math.min(cap, 100);
}

export function brevoConfig(env: Env = process.env):
  | { apiKey: string; senderEmail: string; senderName: string | null }
  | null {
  if (env.EMAIL_FALLBACK_PROVIDER?.trim().toLowerCase() !== "brevo") return null;
  const apiKey = env.BREVO_API_KEY?.trim();
  const senderEmail = env.BREVO_SENDER_EMAIL?.trim();
  if (!apiKey || !senderEmail) return null;
  return { apiKey, senderEmail, senderName: env.BREVO_SENDER_NAME?.trim() || null };
}

/** "Ward Signup <noreply@x.com>" to { name, email }. */
export function parseFrom(from: string): { name: string | null; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  return { name: null, email: from.trim() };
}

/** Start of the current UTC day, the bucket Resend's own daily quota uses (safety cap only). */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Counts one Resend send against one daily counter. Returns false once it is
 * full. If the counter can't be read we let Resend try (fail open): Resend's
 * own 429 is the backstop and triggers the fallback.
 */
async function consumeDailyCounter(action: string, key: string, bucket: Date, max: number): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("try_consume_action_rate", {
      p_action: action,
      p_ip_hash: createHash("sha256").update(key).digest("hex"),
      p_bucket: bucket.toISOString(),
      p_max: max,
    } as never);
    if (error) {
      console.error(`${action} counter error (sending via Resend anyway):`, error);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error(`${action} counter failed (sending via Resend anyway):`, e);
    return true;
  }
}

/**
 * Resend has room when both the UTC day safety cap and the Arizona day budget
 * do. The cap is checked first so a send refused by the cap doesn't use up
 * Arizona budget. A send the Arizona budget refuses has already counted one
 * against the cap; that errs on the safe side (fewer sends, never a 429).
 */
async function consumeResendDailyBudget(brandId: string, now: Date = new Date()): Promise<boolean> {
  const underCap = await consumeDailyCounter(
    "email_resend_daily",
    `resend-daily:${brandId}`,
    utcDayStart(now),
    resendUtcDayCap(),
  );
  if (!underCap) return false;
  return consumeDailyCounter(
    "email_resend_phx_day",
    `resend-phx-day:${brandId}`,
    phoenixDayStartUtc(now),
    resendDailySoftLimit(),
  );
}

export async function sendViaBrevo(
  p: DeliverParams,
  cfg: NonNullable<ReturnType<typeof brevoConfig>>,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliverResult> {
  const parsed = parseFrom(p.from);
  const replyTo = p.replyTo ?? (parsed.email !== cfg.senderEmail ? parsed.email : undefined);
  const body: Record<string, unknown> = {
    sender: { email: cfg.senderEmail, name: cfg.senderName ?? parsed.name ?? p.brand.name },
    to: [{ email: p.to }],
    subject: p.subject,
    htmlContent: p.html,
    ...(p.text ? { textContent: p.text } : {}),
    ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    ...(p.attachments?.length
      ? { attachment: p.attachments.map((a) => ({ name: a.filename, content: a.content })) }
      : {}),
    ...(p.headers && Object.keys(p.headers).length ? { headers: p.headers } : {}),
  };
  try {
    const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Brevo ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true, provider: "brevo" };
  } catch (e) {
    return { ok: false, error: `Brevo request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Deliver one email. `urgent` mail (sign in links, confirmations, invites,
 * reminders) may use Brevo when Resend is out of budget. `realtime` mail
 * (welcome, new creator notice, feedback received) also uses Brevo then, but
 * never goes past our budgets on Resend: with no Brevo it gets
 * `overBudget: true` back so the caller can queue it for the hourly drain.
 * Other non urgent mail gets `overBudget: true` back so the caller can queue
 * it for the next Arizona day.
 */
export async function deliverEmail(
  p: DeliverParams,
  opts: { urgent: boolean; realtime?: boolean },
): Promise<DeliverResult> {
  const brevoOk = opts.urgent || Boolean(opts.realtime);
  const brevo = brevoConfig();
  const resendHasRoom = await consumeResendDailyBudget(p.brand.id);

  if (!resendHasRoom) {
    if (brevoOk && brevo) return sendViaBrevo(p, brevo);
    if (!opts.urgent) return { ok: false, error: "Resend daily soft limit reached", overBudget: true };
    // Urgent with no fallback configured: let Resend try, it may still have room.
  }

  const resend = getResendForBrand(p.brand);
  if (!resend) {
    if (brevo) return sendViaBrevo(p, brevo);
    return { ok: false, error: `Resend API key missing for brand ${p.brand.id}` };
  }

  const send = await resend.emails.send({
    from: p.from,
    to: p.to,
    subject: p.subject,
    html: p.html,
    ...(p.text ? { text: p.text } : {}),
    ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    ...(p.attachments?.length ? { attachments: p.attachments } : {}),
    ...(p.headers && Object.keys(p.headers).length ? { headers: p.headers } : {}),
  });
  if (!send.error) return { ok: true, provider: "resend" };

  const err = send.error as { message?: string; statusCode?: number | null; name?: string };
  const quota =
    err.statusCode === 429 ||
    err.name === "daily_quota_exceeded" ||
    err.name === "rate_limit_exceeded" ||
    err.name === "monthly_quota_exceeded";
  if (quota) {
    if (brevoOk && brevo) return sendViaBrevo(p, brevo);
    if (!opts.urgent) return { ok: false, error: err.message || "Resend 429", overBudget: true };
  }
  return { ok: false, error: err.message || "send failed" };
}
