import { createHash } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getResendForBrand } from "@/lib/resend-for-brand";
import type { PublicBrand } from "@/lib/brand/types";

/**
 * Low level delivery: Resend first, Brevo as a free fallback.
 *
 * Resend's free plan allows 100 emails per UTC day. We keep our own UTC day
 * counter and, once it reaches RESEND_DAILY_SOFT_LIMIT (default 90) or Resend
 * answers 429, urgent mail goes through Brevo instead. Brevo does nothing until
 * EMAIL_FALLBACK_PROVIDER=brevo, BREVO_API_KEY and BREVO_SENDER_EMAIL are set.
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

/** Start of the current UTC day, the bucket Resend's daily quota uses. */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Counts one Resend send against today's UTC budget. Returns false once the
 * soft limit is reached. If the counter can't be read we let Resend try
 * (fail open): Resend's own 429 is the backstop and triggers the fallback.
 */
async function consumeResendDailyBudget(brandId: string): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("try_consume_action_rate", {
      p_action: "email_resend_daily",
      p_ip_hash: createHash("sha256").update(`resend-daily:${brandId}`).digest("hex"),
      p_bucket: utcDayStart().toISOString(),
      p_max: resendDailySoftLimit(),
    } as never);
    if (error) {
      console.error("resend daily counter error (sending via Resend anyway):", error);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error("resend daily counter failed (sending via Resend anyway):", e);
    return true;
  }
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
 * reminders) may use Brevo when Resend is out of budget. Non urgent mail gets
 * `overBudget: true` back so the caller can queue it for after the UTC reset.
 */
export async function deliverEmail(
  p: DeliverParams,
  opts: { urgent: boolean },
): Promise<DeliverResult> {
  const brevo = brevoConfig();
  const resendHasRoom = await consumeResendDailyBudget(p.brand.id);

  if (!resendHasRoom) {
    if (opts.urgent && brevo) return sendViaBrevo(p, brevo);
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
    if (opts.urgent && brevo) return sendViaBrevo(p, brevo);
    if (!opts.urgent) return { ok: false, error: err.message || "Resend 429", overBudget: true };
  }
  return { ok: false, error: err.message || "send failed" };
}
