import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { deliverEmail, hasEmailProviderConfigured } from "@/lib/email-deliver";
import { isBrevoCutoverEnabled } from "@/lib/email-cutover-config";
import { emailOutboundBlock } from "@/lib/email-outbound";
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
 * from unsubscribe suppression. When the Brevo cutover gate is on, a hard
 * bounce or complaint blocks those too. An unreadable list blocks
 * notifications and still allows transactional mail. Gate-off behavior is
 * unchanged. Direct deliverEmail callers are checked inside the cutover.
 */

const GLOBAL_HOURLY_CEILING = Number(process.env.EMAIL_HOURLY_CEILING) || 100;

export type GuardedSendResult =
  | { ok: true; queued?: boolean; provider?: "resend" | "brevo" }
  | {
      ok: false;
      skipped?: "suppressed" | "ceiling" | "no_resend_key" | "outbound_disabled";
      error?: string;
      /** Resend is out of daily budget; queue callers leave the row pending. */
      overBudget?: boolean;
      /** Brevo refused or errored; the drain counts this as a failed attempt. */
      brevoFailed?: boolean;
      /** Provider may have accepted the message. Leave it; do not send again. */
      ambiguous?: boolean;
      /** Try this same message later. No other provider was called. */
      retryable?: boolean;
      /** A later drain will send this same idempotency key. Not a delivery receipt. */
      queued?: boolean;
      /** The idempotency key is finished. Do not keep retrying it. */
      terminal?: boolean;
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

async function suppressionReason(
  emailLower: string,
): Promise<"unsubscribe" | "bounce" | "complaint" | "manual" | "none" | "unknown"> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("email_suppressions")
      .select("reason")
      .eq("email_lower", emailLower)
      .maybeSingle();
    if (error) return "unknown";
    const reason = (data as { reason?: string } | null)?.reason;
    if (reason === "unsubscribe" || reason === "bounce" || reason === "complaint" || reason === "manual") {
      return reason;
    }
    return "none";
  } catch {
    return "unknown";
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
   * Welcome, new creator notice, feedback received. Sends right away when
   * Resend has room in both daily counters; otherwise through Brevo; only if
   * neither can take it, queued due now for the hourly drain. Never held
   * until 12:05 AM.
   */
  realtime?: boolean;
  /**
   * Digests, reports, feedback asks, announcements. Queued until 12:05 AM
   * Arizona unless it is already early in the Arizona day (first
   * EMAIL_DEFER_SEND_WINDOW_HOURS hours, default 6).
   */
  deferrable?: boolean;
  /** Short label stored on queued rows, e.g. "welcome" or "digest". */
  kind?: string;
  /** Set by the queue drain so a queued email is not queued again. */
  fromQueue?: boolean;
  /**
   * Stable Resend Idempotency-Key (the queue drain passes the row id), so a
   * retry of an email Resend already accepted is never sent twice.
   */
  idempotencyKey?: string;
  /**
   * Groups an in-flight cutover attempt so a later request can see that the
   * provider may already have accepted it. Ignored while the gate is off.
   */
  operationScope?: string | null;
};

export async function sendGuardedEmail(params: GuardedSendParams): Promise<GuardedSendResult> {
  const blocked = emailOutboundBlock();
  if (blocked.blocked) {
    return {
      ok: false,
      skipped: "outbound_disabled",
      error: `Email outbound is disabled (${blocked.reason})`,
    };
  }
  const { brand, category, from, to, subject, html, text, replyTo, attachments } =
    params;
  const emailLower = to.trim().toLowerCase();
  const urgent = Boolean(params.urgent);
  const realtime = !urgent && Boolean(params.realtime);

  if (!hasEmailProviderConfigured(brand)) {
    return { ok: false, skipped: "no_resend_key", error: `Resend API key missing for brand ${brand.id}` };
  }

  const queueIt = async (sendAfter?: Date): Promise<GuardedSendResult> => {
    const row: Parameters<typeof enqueueEmail>[0] = {
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
      // Near real time mail is due now (hourly drain); batch mail waits for 12:05 AM Arizona.
      send_after: (sendAfter ?? (realtime ? new Date() : nextResetSendAfter(new Date()))).toISOString(),
    };
    const businessKey = params.idempotencyKey?.trim();
    if (businessKey) row.idempotency_key = businessKey;
    const q = await enqueueEmail(row, { dedupe: realtime || Boolean(sendAfter) });
    return q.ok ? { ok: true, queued: true } : { ok: false, error: q.error };
  };

  const now = new Date();
  if (
    params.deferrable &&
    !urgent &&
    !realtime &&
    !params.fromQueue &&
    deferEnabled() &&
    !inPostResetWindow(now, deferSendWindowHours())
  ) {
    return queueIt();
  }

  const headers: Record<string, string> = {};
  const reason = category === "notification" || isBrevoCutoverEnabled()
    ? await suppressionReason(emailLower)
    : "none";
  const hardInvalid = reason === "bounce" || reason === "complaint";
  const optedOut = reason === "unsubscribe" || reason === "manual" || reason === "unknown";
  // A lookup failure is not an unsubscribe. On the cutover it stays retryable
  // for notifications. Gate-off still treats it as suppressed, as before.
  if (reason === "unknown" && category === "notification" && isBrevoCutoverEnabled()) {
    return { ok: false, error: "Suppression list could not be read. No notification was sent.", retryable: true };
  }
  if (hardInvalid || (category === "notification" && optedOut)) {
    // Hard bounces and complaints block every category once the cutover is on.
    // Unsubscribes still block notifications only, so a sign-in link can be sent.
    return { ok: false, skipped: "suppressed" };
  }
  if (category === "notification") {
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

  const deliverParams = {
    brand,
    from,
    to: emailLower,
    subject,
    html,
    text,
    replyTo,
    attachments,
    headers,
    kind: params.kind,
    idempotencyKey: params.idempotencyKey,
    operationScope: params.operationScope,
  };
  let sent = await deliverEmail(deliverParams, { urgent, realtime });
  const promptKind =
    urgent ||
    params.kind === "reminder" ||
    params.kind === "signup_confirmation" ||
    params.kind === "magic_link" ||
    params.kind === "org_invite_link";
  // One same-provider retry in this request. A 429 is not accepted, so this
  // is not a second provider and not the next-day queue.
  if (!sent.ok && sent.retryable && promptKind && !params.fromQueue) {
    sent = await deliverEmail(deliverParams, { urgent, realtime });
  }
  if (sent.ok) return { ok: true, provider: sent.provider };
  if (sent.outboundDisabled) {
    return { ok: false, skipped: "outbound_disabled", error: sent.error };
  }
  if (sent.ambiguous) return { ok: false, error: sent.error, ambiguous: true };
  if (sent.terminal) return { ok: false, error: sent.error, terminal: true };
  if (sent.retryable) {
    // Signup confirmation has no later cron. Park the same key for the hourly
    // drain instead of dropping the second 429. Reminders and sign-in links
    // are not parked here: the reminder cron retries, and a magic link is a
    // live credential the person is waiting on.
    if (params.kind === "signup_confirmation" && !params.fromQueue) {
      const parked = await queueIt(new Date());
      if (parked.ok && parked.queued) {
        return { ok: false, error: sent.error, retryable: true, queued: true };
      }
      return { ok: false, error: parked.ok ? sent.error : parked.error, retryable: true };
    }
    if (promptKind) return { ok: false, error: sent.error, retryable: true };
    if (!params.fromQueue) return queueIt();
    return { ok: false, error: sent.error, retryable: true };
  }
  if (sent.overBudget) {
    // Out of Resend budget and Brevo couldn't take it: near real time mail is
    // queued due now for the hourly drain; batch mail waits for 12:05 AM Arizona.
    if (!params.fromQueue && (realtime || deferEnabled())) return queueIt();
    return { ok: false, error: sent.error, overBudget: true };
  }
  if (realtime && sent.brevoFailed) {
    // Resend was full and Brevo failed: queue it due now for the hourly drain
    // (3 attempts with backoff there) instead of failing the welcome.
    if (!params.fromQueue) return queueIt();
    return { ok: false, error: sent.error, brevoFailed: true };
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

/**
 * Take one dedupe slot and record who owns it. "unavailable" means the
 * limiter could not be read; that is not the same as the slot already being
 * taken. A later release only succeeds for this holder.
 */
export async function consumeOwnedEmailSlot(
  action: string,
  key: string,
  maxPerWindow: number,
  bucketStart: Date,
  holder: string,
): Promise<boolean | "unavailable"> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("try_consume_owned_slot", {
      p_action: action,
      p_ip_hash: createHash("sha256").update(key).digest("hex"),
      p_bucket: bucketStart.toISOString(),
      p_max: maxPerWindow,
      p_holder: holder,
    } as never);
    if (error) {
      console.error(`owned email slot error for ${action} (failing closed):`, error);
      return "unavailable";
    }
    return data === true;
  } catch (e) {
    console.error(`owned email slot failed for ${action} (failing closed):`, e);
    return "unavailable";
  }
}

/** Release a slot only when this holder still owns it. A repeat is a no-op. */
export async function releaseOwnedEmailSlot(
  action: string,
  key: string,
  bucketStart: Date,
  holder: string,
): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("release_owned_slot", {
      p_action: action,
      p_ip_hash: createHash("sha256").update(key).digest("hex"),
      p_bucket: bucketStart.toISOString(),
      p_holder: holder,
    } as never);
    if (error) {
      console.error(`owned email slot release error for ${action}:`, error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(`owned email slot release failed for ${action}:`, e);
    return false;
  }
}

/**
 * Increment a keyed cap and return the new count. Null means the cap is full.
 * "unavailable" means the counter could not be read, which is not "full".
 */
export async function consumeEmailKeyRateCount(
  action: string,
  key: string,
  maxPerHour: number,
  bucketStart?: Date,
): Promise<number | null | "unavailable"> {
  try {
    const admin = createServiceRoleClient();
    const bucket = bucketStart ? new Date(bucketStart) : new Date();
    if (!bucketStart) bucket.setMinutes(0, 0, 0);
    const { data, error } = await admin.rpc("try_consume_action_rate_count", {
      p_action: action,
      p_ip_hash: createHash("sha256").update(key).digest("hex"),
      p_bucket: bucket.toISOString(),
      p_max: maxPerHour,
    } as never);
    if (error) {
      console.error(`email key rate count error for ${action} (failing closed):`, error);
      return "unavailable";
    }
    if (typeof data === "number" && Number.isInteger(data) && data >= 1) return data;
    return null;
  } catch (e) {
    console.error(`email key rate count failed for ${action} (failing closed):`, e);
    return "unavailable";
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
