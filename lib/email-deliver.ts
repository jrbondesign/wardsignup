import { createHash, randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getResendForBrand } from "@/lib/resend-for-brand";
import type { PublicBrand } from "@/lib/brand/types";
import { phoenixDayStartUtc } from "@/lib/phoenix-time";
import { getPostHogClient } from "@/lib/posthog-server";
import { isBrevoCutoverEnabled } from "@/lib/email-cutover-config";
import { emailOutboundBlock } from "@/lib/email-outbound";

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
 *
 * Failover by Resend failure class (see classifyResendError):
 * - quota (429, daily/monthly quota, rate limit): Brevo for urgent and near
 *   real time mail; batch mail comes back overBudget so it waits for the queue.
 * - transient (5xx, network error): one retry on Resend with the same
 *   Idempotency-Key, so if Resend did take the first request it answers with
 *   the original email instead of sending a second one. Still failing: Brevo.
 * - auth (Resend key missing, invalid, suspended): Brevo.
 * - in_progress (409, the same key is still being processed): never Brevo,
 *   Resend may be sending it right now.
 * - permanent (400/422 validation and other 4xx): never Brevo, the same email
 *   would fail there too.
 * Every send logs which provider took it. A failover also records a PostHog
 * event and sends at most one alert email per Arizona day (via Brevo).
 *
 * Routing by type (bulkProvider): bulk, non urgent mail (reminders, daily
 * digests, feedback asks; see BULK_KINDS) goes to Brevo FIRST when Brevo is
 * configured, so Resend's 100 a day free quota stays free for sign in links,
 * invites and signup confirmations. If Brevo refuses or errors, the email
 * falls back to the normal Resend path above (budget, retry, idempotency key).
 * With no Brevo configured, or EMAIL_BULK_PROVIDER=resend, nothing changes.
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
  /** Short label for logs, e.g. "magic_link" or "digest". Never the recipient. */
  kind?: string;
  /**
   * Resend Idempotency-Key (24 hour window). Pass a stable key (for example the
   * queue row id) so a retry of an email Resend already accepted never sends it
   * twice. Defaults to a fresh key per call, which still covers the in-call retry.
   */
  idempotencyKey?: string;
  /**
   * Cutover-only grouping for "is a send of this login still unconfirmed?".
   * Ignored on the production Resend path.
   */
  operationScope?: string | null;
};

export type DeliverResult =
  | { ok: true; provider: "resend" | "brevo"; messageId?: string; duplicateSuppressed?: boolean }
  | {
      ok: false;
      error: string;
      overBudget?: boolean;
      /** Brevo was tried (Resend out of budget or 429) and refused or errored. */
      brevoFailed?: boolean;
      /** Provider may have accepted the message. Do not send it anywhere else. */
      ambiguous?: boolean;
      outboundDisabled?: boolean;
      /** Same idempotency key already finished. Nothing was sent on this call. */
      duplicateSuppressed?: boolean;
      /** Safe to try the same provider later. The other provider was not called. */
      retryable?: boolean;
      /** Do not retry this key. */
      terminal?: boolean;
    };

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

/**
 * Bulk, non urgent kinds. Brevo first when bulkProvider() says so. Sign in
 * links, invites, signup confirmations, welcome and leader notices are NOT
 * here: they stay Resend first.
 */
export const BULK_KINDS: ReadonlySet<string> = new Set(["reminder", "digest", "feedback", "feedback_summary"]);

export function isBulkKind(kind: string | undefined | null): boolean {
  return Boolean(kind && BULK_KINDS.has(kind));
}

/**
 * Which provider bulk mail tries first. EMAIL_BULK_PROVIDER:
 * - unset or "auto" (default): Brevo when brevoConfig() is complete, else Resend.
 *   Same switch as the failover, so nothing changes until Brevo is set up.
 * - "resend": always Resend first (the behavior before this switch existed).
 * - "brevo": same as auto (Brevo needs its config either way).
 * Anything else is treated as "resend", the old behavior.
 */
export function bulkProvider(env: Env = process.env): "resend" | "brevo" {
  const v = env.EMAIL_BULK_PROVIDER?.trim().toLowerCase() || "auto";
  if (v !== "auto" && v !== "brevo") return "resend";
  return brevoConfig(env) ? "brevo" : "resend";
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
 * Fail-closed copy of the live Resend counters. A read error does not send.
 * Both windows are reserved in one database call, so a full Arizona bucket
 * does not keep a UTC slot. The production path above stays fail-open and
 * still consumes one window at a time.
 */
export async function consumeSharedResendBudget(
  brandId: string,
  recipients: number,
  now: Date = new Date(),
  env: Env = process.env,
): Promise<"reserved" | "full" | "unknown"> {
  if (!Number.isInteger(recipients) || recipients < 1 || recipients > 20) return "unknown";
  const cap = resendUtcDayCap(env);
  const soft = resendDailySoftLimit(env);
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("try_consume_resend_pair", {
      p_utc_hash: createHash("sha256").update(`resend-daily:${brandId}`).digest("hex"),
      p_utc_bucket: utcDayStart(now).toISOString(),
      p_utc_max: cap,
      p_phx_hash: createHash("sha256").update(`resend-phx-day:${brandId}`).digest("hex"),
      p_phx_bucket: phoenixDayStartUtc(now).toISOString(),
      p_phx_max: soft,
      p_amount: recipients,
    } as never);
    if (error) return "unknown";
    if (data === "reserved" || data === "full") return data;
    return "unknown";
  } catch {
    return "unknown";
  }
}

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

export type ResendFailure = "quota" | "transient" | "auth" | "in_progress" | "permanent";

type ResendError = { message?: string; statusCode?: number | null; name?: string };

const QUOTA_NAMES = new Set(["daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded"]);
const TRANSIENT_NAMES = new Set(["application_error", "internal_server_error", "service_unavailable"]);
const AUTH_NAMES = new Set(["missing_api_key", "restricted_api_key", "suspended_api_key"]);

/** Sorts a Resend error into the class that decides whether Brevo may take the email. */
export function classifyResendError(err: ResendError | null | undefined): ResendFailure {
  const status = typeof err?.statusCode === "number" ? err.statusCode : null;
  const name = err?.name ?? "";
  if (status === 429 || QUOTA_NAMES.has(name)) return "quota";
  if (status === 409 && name === "concurrent_idempotent_requests") return "in_progress";
  if (status !== null && status >= 500) return "transient";
  // The SDK reports a network failure (no response) as application_error with no status.
  if (status === null && TRANSIENT_NAMES.has(name)) return "transient";
  if (status === 401 || AUTH_NAMES.has(name)) return "auth";
  if (status === 403 && /api key/i.test(err?.message ?? "")) return "auth";
  return "permanent";
}

function retryDelayMs(env: Env = process.env): number {
  const n = Number(env.EMAIL_RESEND_RETRY_MS);
  return Number.isFinite(n) && n >= 0 ? n : 400;
}

/** Who gets the failover alert. The founder inbox by default. */
export function failoverAlertTo(env: Env = process.env): string | null {
  if (env.EMAIL_FAILOVER_ALERT?.trim().toLowerCase() === "off") return null;
  return env.EMAIL_FAILOVER_ALERT_TO?.trim() || "jonathan@wardsignup.com";
}

/** One provider line per email, for Vercel logs. No recipient, no subject. */
function logProvider(p: DeliverParams, provider: "resend" | "brevo", reason?: string, route?: "bulk") {
  console.info(
    `[email] sent provider=${provider} brand=${p.brand.id} kind=${p.kind ?? "other"}${route ? ` route=${route}` : ""}${reason ? ` failover=${reason}` : ""}`,
  );
}

/**
 * Called once per email that went to Brevo instead of Resend. PostHog gets
 * every event (cheap, queryable); the alert email is capped at one per brand
 * per Arizona day through the action_rate_limit counter, failing closed so a
 * counter outage can't turn into an alert storm. Never throws.
 */
async function noteFailover(
  p: DeliverParams,
  reason: ResendFailure | "budget" | "no_resend_key",
  detail: string | undefined,
  brevo: NonNullable<ReturnType<typeof brevoConfig>>,
): Promise<void> {
  console.warn(
    `[email-failover] brand=${p.brand.id} kind=${p.kind ?? "other"} reason=${reason}${detail ? ` detail=${detail.slice(0, 120)}` : ""}`,
  );
  try {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      getPostHogClient().capture({
        distinctId: `server_email_${p.brand.id}`,
        event: "email_failover",
        properties: { brand_id: p.brand.id, kind: p.kind ?? "other", reason, provider: "brevo" },
      });
    }
  } catch (e) {
    console.error("email_failover capture failed:", e);
  }
  const to = failoverAlertTo();
  if (!to || p.to.trim().toLowerCase() === to.toLowerCase()) return;
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin.rpc("try_consume_action_rate", {
      p_action: "email_failover_alert",
      p_ip_hash: createHash("sha256").update(`failover-alert:${p.brand.id}`).digest("hex"),
      p_bucket: phoenixDayStartUtc().toISOString(),
      p_max: 1,
    } as never);
    if (error || data !== true) return;
    const why =
      reason === "budget" || reason === "quota"
        ? "Resend is out of daily quota (our budget or Resend's 429)."
        : reason === "transient"
          ? "Resend returned a server or network error twice."
          : reason === "auth" || reason === "no_resend_key"
            ? "The Resend API key is missing, invalid or suspended."
            : "Resend could not take the email.";
    await sendViaBrevo(
      {
        brand: p.brand,
        from: `${p.brand.name} <${brevo.senderEmail}>`,
        to,
        subject: `${p.brand.name} email failover to Brevo`,
        text: `Emails are going out through Brevo instead of Resend.\n\nReason: ${why}\nFirst email: ${p.kind ?? "other"}\n\nThis alert is sent at most once per Arizona day. Count today's failovers with the PostHog event email_failover.`,
        html: `<p>Emails are going out through Brevo instead of Resend.</p><p>Reason: ${why}<br>First email: ${(p.kind ?? "other").replace(/[^a-z0-9_-]/gi, "")}</p><p>This alert is sent at most once per Arizona day. Count today's failovers with the PostHog event <code>email_failover</code>.</p>`,
      },
      brevo,
    );
  } catch (e) {
    console.error("email failover alert failed:", e);
  }
}

/** Brevo API call timeout. A hung request must not stall a cron batch. */
export const BREVO_TIMEOUT_MS = 15_000;

export async function sendViaBrevo(
  p: DeliverParams,
  cfg: NonNullable<ReturnType<typeof brevoConfig>>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = BREVO_TIMEOUT_MS,
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
    ...(p.headers && Object.keys(p.headers).length || p.idempotencyKey
      ? { headers: { ...(p.headers ?? {}), ...(p.idempotencyKey ? { IdempotencyKey: p.idempotencyKey } : {}) } }
      : {}),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Brevo ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true, provider: "brevo" };
  } catch (e) {
    const why = controller.signal.aborted ? `timed out after ${timeoutMs}ms` : e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Brevo request failed: ${why}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver one email. `urgent` mail (sign in links, confirmations, invites,
 * reminders) may use Brevo when Resend is out of budget. `realtime` mail
 * (welcome, new creator notice, feedback received) also uses Brevo then, but
 * never goes past our budgets on Resend: with no Brevo it gets
 * `overBudget: true` back, and if Brevo fails it gets `brevoFailed: true`
 * back, so the caller can queue it for the hourly drain.
 * Other non urgent mail gets `overBudget: true` back so the caller can queue
 * it for the next Arizona day.
 *
 * Bulk mail (opts.bulk, or a kind in BULK_KINDS) tries Brevo first when
 * bulkProvider() is "brevo". It does not use Resend budget then. If Brevo
 * fails, the email takes the normal path above on Resend, and Brevo is not
 * tried a second time for it.
 */
export async function deliverEmail(
  params: DeliverParams,
  opts: { urgent: boolean; realtime?: boolean; bulk?: boolean },
): Promise<DeliverResult> {
  const blocked = emailOutboundBlock();
  if (blocked.blocked) {
    return {
      ok: false,
      error: `Email outbound is disabled (${blocked.reason})`,
      outboundDisabled: true,
    };
  }
  if (isBrevoCutoverEnabled()) {
    const { productionCutoverDeps, runBrevoCutover } = await import("@/lib/email-cutover");
    return runBrevoCutover(params, opts, productionCutoverDeps());
  }
  const p: DeliverParams = { ...params, idempotencyKey: params.idempotencyKey ?? `ws/${randomUUID()}` };
  const brevoOk = opts.urgent || Boolean(opts.realtime);
  let brevo = brevoConfig();

  const bulk = opts.bulk ?? isBulkKind(p.kind);
  if (bulk && brevo && bulkProvider() === "brevo") {
    const first = await sendViaBrevo(p, brevo);
    if (first.ok) {
      logProvider(p, "brevo", undefined, "bulk");
      return first;
    }
    console.warn(
      `[email] bulk brevo failed brand=${p.brand.id} kind=${p.kind ?? "other"}, trying Resend: ${first.error.slice(0, 160)}`,
    );
    // Brevo just failed for this email: don't send it there again below.
    brevo = null;
  }
  const viaBrevo = async (
    cfg: NonNullable<typeof brevo>,
    reason: ResendFailure | "budget" | "no_resend_key",
    detail?: string,
  ): Promise<DeliverResult> => {
    const r = await sendViaBrevo(p, cfg);
    if (!r.ok) {
      console.error(`[email] brevo failed brand=${p.brand.id} kind=${p.kind ?? "other"} after ${reason}: ${r.error}`);
      return { ...r, brevoFailed: true };
    }
    logProvider(p, "brevo", reason);
    await noteFailover(p, reason, detail, cfg);
    return r;
  };
  const resendHasRoom = await consumeResendDailyBudget(p.brand.id);

  if (!resendHasRoom) {
    if (brevoOk && brevo) return viaBrevo(brevo, "budget");
    if (!opts.urgent) return { ok: false, error: "Resend daily soft limit reached", overBudget: true };
    // Urgent with no fallback configured: let Resend try, it may still have room.
  }

  const resend = getResendForBrand(p.brand);
  if (!resend) {
    if (brevo) return viaBrevo(brevo, "no_resend_key");
    return { ok: false, error: `Resend API key missing for brand ${p.brand.id}` };
  }

  const sendOnResend = () =>
    resend.emails.send(
      {
        from: p.from,
        to: p.to,
        subject: p.subject,
        html: p.html,
        ...(p.text ? { text: p.text } : {}),
        ...(p.replyTo ? { replyTo: p.replyTo } : {}),
        ...(p.attachments?.length ? { attachments: p.attachments } : {}),
        ...(p.headers && Object.keys(p.headers).length ? { headers: p.headers } : {}),
      },
      { idempotencyKey: p.idempotencyKey },
    );

  let send = await sendOnResend();
  let failure = send.error ? classifyResendError(send.error as ResendError) : null;
  if (failure === "transient" || failure === "in_progress") {
    // Same Idempotency-Key: if Resend took the first request it returns that
    // email instead of sending another one.
    const wait = retryDelayMs();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    send = await sendOnResend();
    failure = send.error ? classifyResendError(send.error as ResendError) : null;
  }
  if (!send.error) {
    logProvider(p, "resend");
    return { ok: true, provider: "resend" };
  }

  const err = send.error as ResendError;
  const message = err.message || "send failed";
  if (failure === "quota") {
    if (brevoOk && brevo) return viaBrevo(brevo, "quota", err.name);
    if (!opts.urgent) return { ok: false, error: err.message || "Resend 429", overBudget: true };
    return { ok: false, error: message };
  }
  if ((failure === "transient" || failure === "auth") && brevo) {
    return viaBrevo(brevo, failure, `${err.statusCode ?? "network"} ${err.name ?? ""}`.trim());
  }
  // permanent (validation) and in_progress never fail over: the first would
  // fail on Brevo too, the second may already be on its way through Resend.
  return { ok: false, error: message };
}

/** One extra attempt on the same callback. The caller passes the same idempotency key. */
export async function retryDeliver<T extends { ok: true } | { ok: false; retryable?: boolean }>(
  send: () => Promise<T>,
): Promise<T> {
  const first = await send();
  if (!first.ok && first.retryable) return send();
  return first;
}

/** True when some provider can send for this brand (Resend key, or the Brevo fallback). */
export function hasEmailProviderConfigured(brand: Pick<PublicBrand, "id">): boolean {
  return Boolean(getResendForBrand(brand)) || Boolean(brevoConfig());
}
