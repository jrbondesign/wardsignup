import { createHash, timingSafeEqual } from "crypto";
import { emailOutboundBlock } from "@/lib/email-outbound";
import type { DeliveryStatus } from "@/lib/email-quota-state";

type Env = Record<string, string | undefined>;

/** Captured requests older than this are refused. Brevo retries inside this window. */
export const BREVO_WEBHOOK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const BREVO_WEBHOOK_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function tokenMatches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Brevo does not sign webhook bodies. Auth is the bearer token or custom
 * header configured when the webhook is created. The sending API key is not
 * a webhook secret: if BREVO_WEBHOOK_TOKEN is unset this refuses, even when
 * WARDSIGNUP_BREVO_API_KEY is present.
 */
export function authorizeBrevoWebhook(
  headers: { get(name: string): string | null },
  env: Env = process.env,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const expected = env.BREVO_WEBHOOK_TOKEN?.trim() ?? "";
  if (!expected) return { ok: false, status: 503, error: "Webhook token not configured" };
  const authorization = headers.get("authorization") ?? "";
  const custom = headers.get("x-wardsignup-webhook-token") ?? "";
  const candidates: string[] = [];
  if (/^bearer\s+/i.test(authorization)) candidates.push(authorization.replace(/^bearer\s+/i, "").trim());
  if (custom.trim()) candidates.push(custom.trim());
  if (candidates.some((candidate) => candidate && tokenMatches(candidate, expected))) return { ok: true };
  return { ok: false, status: 401, error: "Invalid webhook token" };
}

export type BrevoWebhookEffect = {
  eventId: string;
  event: string;
  email: string | null;
  messageId: string | null;
  tag: string | null;
  suppress: "bounce" | "complaint" | "unsubscribe" | null;
  deliveryStatus: DeliveryStatus | null;
};

const SUPPRESS: Record<string, BrevoWebhookEffect["suppress"]> = {
  hardbounce: "bounce",
  hard_bounce: "bounce",
  invalid: "bounce",
  invalid_email: "bounce",
  blocked: "bounce",
  spam: "complaint",
  complaint: "complaint",
  unsubscribed: "unsubscribe",
};

const STATUS: Record<string, DeliveryStatus> = {
  request: "accepted",
  sent: "accepted",
  delivered: "delivered",
  softbounce: "deferred",
  soft_bounce: "deferred",
  deferred: "deferred",
  hardbounce: "bounced",
  hard_bounce: "bounced",
  invalid: "bounced",
  invalid_email: "bounced",
  blocked: "bounced",
  // Brevo's "error" event is a failed delivery of that message. The published
  // sample is a copy of invalid_email and does not say the address itself is
  // invalid, so the address is not suppressed.
  error: "bounced",
  spam: "complained",
  unsubscribed: "suppressed",
};

/** Strip SMTP brackets so `<id@host>` and `id@host` are the same receipt. */
export function normalizeProviderMessageId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/^<+/, "").replace(/>+$/, "").trim().toLowerCase();
  return text ? text.slice(0, 500) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Brevo's samples use 10-digit seconds for `ts` and `ts_event`. A 13-digit
  // value is already milliseconds. `ts_epoch` in those samples is the send
  // time and is often the same 10-digit seconds value, despite the field
  // text saying milliseconds, so seconds-scale `ts_epoch` is not an event time.
  if (value >= 1e12) return value;
  if (value >= 1e9) return value * 1000;
  return null;
}

/**
 * Freshness uses when the event happened (`ts_event`, then `ts`).
 * `ts_epoch` is when the message was sent. It is used only when it is
 * millisecond-scale and no event timestamp is present.
 */
function eventTimeMs(event: Record<string, unknown>): number | null {
  const eventAt = asEpochMs(event.ts_event) ?? asEpochMs(event.ts);
  if (eventAt !== null) return eventAt;
  if (typeof event.ts_epoch === "number" && event.ts_epoch >= 1e12) return event.ts_epoch;
  return null;
}

function messageIdOf(event: Record<string, unknown>): string | null {
  const raw = event["message-id"] ?? event.messageId;
  return normalizeProviderMessageId(typeof raw === "string" ? raw : null);
}

function tagOf(event: Record<string, unknown>): string | null {
  const chunks: string[] = [];
  if (typeof event.tag === "string") chunks.push(event.tag);
  if (Array.isArray(event.tags)) {
    for (const item of event.tags) {
      if (typeof item === "string") chunks.push(item);
    }
  }
  const match = chunks.join(" ").match(/k[A-Za-z0-9]{8,40}/);
  return match ? match[0] : null;
}

function emailOf(event: Record<string, unknown>): string | null {
  const raw = event.email;
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email.includes("@") || email.length > 320) return null;
  return email;
}

export function parseBrevoWebhookEvents(
  payload: unknown,
  nowMs: number,
): { ok: true; events: BrevoWebhookEffect[] } | { ok: false; error: string } {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length < 1 || list.length > 100) return { ok: false, error: "Unexpected webhook batch" };
  const events: BrevoWebhookEffect[] = [];
  for (const item of list) {
    const event = asRecord(item);
    if (!event) return { ok: false, error: "Webhook event was not an object" };
    const at = eventTimeMs(event);
    if (at === null) return { ok: false, error: "Webhook event has no timestamp" };
    if (at > nowMs + BREVO_WEBHOOK_FUTURE_SKEW_MS) return { ok: false, error: "Webhook timestamp is in the future" };
    if (nowMs - at > BREVO_WEBHOOK_MAX_AGE_MS) return { ok: false, error: "Webhook timestamp is too old" };
    const name = typeof event.event === "string" ? event.event : "";
    const key = name.toLowerCase();
    const messageId = messageIdOf(event);
    const email = emailOf(event);
    const id = event.id ?? "";
    const eventId = createHash("sha256")
      .update(JSON.stringify([key, id, messageId ?? "", email ?? "", at]))
      .digest("hex");
    events.push({
      eventId,
      event: name.slice(0, 80),
      email,
      messageId,
      tag: tagOf(event),
      suppress: email ? (SUPPRESS[key] ?? null) : null,
      deliveryStatus: STATUS[key] ?? null,
    });
  }
  return { ok: true, events };
}

export type BrevoWebhookDeps = {
  env: Env;
  now: () => Date;
  /** True when this event id was already stored. Does not insert. */
  alreadyRecorded: (eventId: string) => Promise<boolean>;
  recordEvent: (eventId: string) => Promise<boolean>;
  forgetEvent: (eventId: string) => Promise<void>;
  suppress: (email: string, reason: "bounce" | "complaint" | "unsubscribe", source: string) => Promise<boolean>;
  applyStatus: (effect: BrevoWebhookEffect) => Promise<void>;
};

export async function handleBrevoWebhook(request: Request, deps: BrevoWebhookDeps): Promise<Response> {
  const block = emailOutboundBlock(deps.env);
  if (block.blocked) {
    return Response.json({ ok: true, disabled: true, reason: block.reason });
  }
  const auth = authorizeBrevoWebhook(request.headers, deps.env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBrevoWebhookEvents(payload, deps.now().getTime());
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  let applied = 0;
  let duplicates = 0;
  for (const effect of parsed.events) {
    let seen = false;
    try {
      seen = await deps.alreadyRecorded(effect.eventId);
    } catch (e) {
      console.error("brevo webhook lookup failed:", e instanceof Error ? e.message : "error");
      return Response.json({ error: "record_failed", applied }, { status: 500 });
    }
    if (seen) {
      duplicates += 1;
      continue;
    }
    // Apply before the receipt. A crash here leaves no receipt, so Brevo's
    // retry applies again. Suppress and status are idempotent.
    try {
      if (effect.suppress && effect.email) {
        const source = `brevo:${effect.event}:${effect.messageId ?? effect.eventId.slice(0, 12)}`;
        const ok = await deps.suppress(effect.email, effect.suppress, source);
        if (!ok) throw new Error("suppress failed");
      }
      if (effect.deliveryStatus) await deps.applyStatus(effect);
    } catch (e) {
      console.error("brevo webhook apply failed:", e instanceof Error ? e.message : "error");
      return Response.json({ error: "apply_failed", applied }, { status: 500 });
    }
    try {
      const fresh = await deps.recordEvent(effect.eventId);
      if (!fresh) duplicates += 1;
      else applied += 1;
    } catch (e) {
      console.error("brevo webhook record failed:", e instanceof Error ? e.message : "error");
      return Response.json({ error: "record_failed", applied }, { status: 500 });
    }
  }
  return Response.json({ ok: true, applied, duplicates });
}
