import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getResendForBrand } from "@/lib/resend-for-brand";
import { brevoConfig, deliverEmail } from "@/lib/email-deliver";
import { enqueueEmail } from "@/lib/email-queue";
import { deferEnabled, deferSendWindowHours, inPostResetWindow, nextResetSendAfter } from "@/lib/email-queue-time";
import type { PublicBrand } from "@/lib/brand/types";

/**
 * Central guarded email sender. Every NOTIFICATION-class email (digests,
 * alerts, reminders, invites, feedback asks, leader notices) must go through
 * sendGuardedEmail. It enforces, in order:
 *
 *   1. Suppression list — an address in email_suppressions never gets
 *      notification mail again (one-click unsubscribe, bounces, manual).
 *   2. Unsubscribe headers — RFC 8058 List-Unsubscribe One-Click on every
 *      notification email.
 *   3. Global hourly ceiling — a hard cap on notification sends per brand per
 *      hour, FAIL-CLOSED: if the ceiling can't be checked, the email does NOT
 *      go out. This is the blast guard: no bug, backlog flush, or retry loop
 *      can exceed it.
 *
 * TRANSACTIONAL mail (magic links, signup confirmations, welcome) is exempt
 * from suppression/unsubscribe (users need those to function) but SHOULD still
 * be sent through here with category "transactional" to get the ceiling.
 */

const GLOBAL_HOURLY_CEILING = Number(process.env.EMAIL_HOURLY_CEILING) || 100;

export type GuardedSendResult =
  | { ok: true; queued?: boolean }
  | {
      ok: false;
      skipped?: "suppressed" | "ceiling" | "no_resend_key";
      error?: string;
      /** Resend is out of daily budget; queue callers leave the row pending. */
      overBudget?: boolean;
    };

function unsubSecret(): string | null {
  // Dedicated secret preferred; CRON_SECRET as fallback so unsubscribe works
  // without new env. Never expose either directly.
  const s =
    process.env.EMAIL_UNSUB_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return s || null;
}

export function unsubscribeSignature(emailLower: string): string | null {
  const secret = unsubSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(emailLower).digest("hex");
}

export function verifyUnsubscribeSignature(
  emailLower: string,
  sig: string,
): boolean {
  const expected = unsubscribeSignature(emailLower);
  if (!expected || !/^[a-f0-9]{64}$/i.test(sig)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export function unsubscribeUrl(brand: PublicBrand, to: string): string | null {
  const emailLower = to.trim().toLowerCase();
  const sig = unsubscribeSignature(emailLower);
  if (!sig) return null;
  const e = Buffer.from(emailLower).toString("base64url");
  return `${brand.siteUrl.replace(/\/$/, "")}/api/unsubscribe?e=${e}&sig=${sig}`;
}

async function isSuppressed(emailLower: string): Promise<boolean | null> {
  // null = could not determine (treated as suppressed by callers: fail closed)
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("email_suppressions")
      .select("email_lower")
      .eq("email_lower", emailLower)
      .maybeSingle();
    if (error) return null;
    return Boolean(data);
  } catch {
    return null;
  }
}

/**
 * Global per-brand hourly notification ceiling, reusing the
 * try_consume_action_rate RPC with a constant key. FAIL-CLOSED: any error →
 * not allowed. This is deliberate and load-bearing — the ceiling exists
 * precisely for the moments when other guards are broken.
 */
async function consumeGlobalCeiling(brandId: string): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const bucket = new Date();
    bucket.setMinutes(0, 0, 0);
    const key = createHash("sha256")
      .update(`email-ceiling:${brandId}`)
      .digest("hex");
    const { data, error } = await admin.rpc("try_consume_action_rate", {
      p_action: "email_global_ceiling",
      p_ip_hash: key,
      p_bucket: bucket.toISOString(),
      p_max: GLOBAL_HOURLY_CEILING,
    } as never);
    if (error) {
      console.error("email ceiling RPC error (failing closed):", error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("email ceiling check failed (failing closed):", e);
    return false;
  }
}

export type GuardedSendParams = {
  brand: PublicBrand;
  category: "notification" | "transactional";
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string }>;
  /**
   * Sign in links, confirmations, invites and reminders. Urgent mail is never
   * queued and may use the Brevo fallback when Resend is out of daily budget.
   */
  urgent?: boolean;
  /**
   * Welcome, digests, reports, feedback asks, announcements, new creator
   * notices. Queued until just after the UTC reset unless it is already early
   * in the UTC day.
   */
  deferrable?: boolean;
  /** Short label stored on queued rows, e.g. "welcome" or "digest". */
  kind?: string;
  /** Set by the queue drain so a queued email is not queued again. */
  fromQueue?: boolean;
};

export async function sendGuardedEmail(params: GuardedSendParams): Promise<GuardedSendResult> {
  const { brand, category, from, to, subject, html, text, replyTo, attachments } =
    params;
  const emailLower = to.trim().toLowerCase();
  const urgent = Boolean(params.urgent);

  if (!getResendForBrand(brand) && !brevoConfig()) {
    return { ok: false, skipped: "no_resend_key", error: `Resend API key missing for brand ${brand.id}` };
  }

  const queueIt = async (): Promise<GuardedSendResult> => {
    const q = await enqueueEmail({
      brand_id: brand.id,
      category,
      kind: params.kind ?? "other",
      from_address: from,
      to_address: emailLower,
      subject,
      html,
      text_body: text ?? null,
      reply_to: replyTo ?? null,
      attachments: attachments?.length ? attachments : null,
      send_after: nextResetSendAfter(new Date()).toISOString(),
    });
    return q.ok ? { ok: true, queued: true } : { ok: false, error: q.error };
  };

  const now = new Date();
  if (
    params.deferrable &&
    !urgent &&
    !params.fromQueue &&
    deferEnabled() &&
    !inPostResetWindow(now, deferSendWindowHours())
  ) {
    return queueIt();
  }

  const headers: Record<string, string> = {};
  if (category === "notification") {
    const suppressed = await isSuppressed(emailLower);
    if (suppressed !== false) {
      // true = unsubscribed; null = couldn't check → fail closed.
      return { ok: false, skipped: "suppressed" };
    }
    const url = unsubscribeUrl(brand, emailLower);
    if (url) {
      headers["List-Unsubscribe"] = `<${url}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  }

  const underCeiling = await consumeGlobalCeiling(brand.id);
  if (!underCeiling) {
    console.error(
      `EMAIL CEILING HIT (or unverifiable) for ${brand.id} — refusing send to ${emailLower}`,
    );
    return { ok: false, skipped: "ceiling" };
  }

  const sent = await deliverEmail(
    { brand, from, to: emailLower, subject, html, text, replyTo, attachments, headers },
    { urgent },
  );
  if (sent.ok) return { ok: true };
  if (sent.overBudget) {
    // Non urgent mail when Resend is out of budget waits for the reset.
    if (!params.fromQueue && deferEnabled()) return queueIt();
    return { ok: false, error: sent.error, overBudget: true };
  }
  return { ok: false, error: sent.error };
}

/**
 * Generic keyed hourly limiter for email paths (per-campaign, per-recipient,
 * …), reusing try_consume_action_rate with a hashed key instead of an IP.
 * FAIL-CLOSED like the ceiling.
 */
export async function consumeEmailKeyRate(
  action: string,
  key: string,
  maxPerHour: number,
  bucketStart?: Date,
): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const bucket = bucketStart ? new Date(bucketStart) : new Date();
    if (!bucketStart) bucket.setMinutes(0, 0, 0);
    const { data, error } = await admin.rpc("try_consume_action_rate", {
      p_action: action,
      p_ip_hash: createHash("sha256").update(key).digest("hex"),
      p_bucket: bucket.toISOString(),
      p_max: maxPerHour,
    } as never);
    if (error) {
      console.error(`email key rate error for ${action} (failing closed):`, error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(`email key rate failed for ${action} (failing closed):`, e);
    return false;
  }
}

/** Add an address to the suppression list (idempotent). */
export async function suppressEmail(
  emailLower: string,
  reason: "unsubscribe" | "bounce" | "complaint" | "manual",
  source?: string,
): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("email_suppressions").upsert(
      {
        email_lower: emailLower,
        reason,
        source: source ?? null,
      } as never,
      { onConflict: "email_lower", ignoreDuplicates: true },
    );
    return !error;
  } catch {
    return false;
  }
}
