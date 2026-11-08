import { randomUUID } from "crypto";
import type { DeliverParams, DeliverResult } from "@/lib/email-deliver";
import {
  classifyBrevoHttp,
  classifyResendFallback,
  type ProviderHttpResult,
} from "@/lib/email-brevo-classify";
import { postBrevoTransactional } from "@/lib/email-brevo-transport";
import {
  brevoRecipientCap,
  brevoWindowKey,
  countEnvelopeRecipients,
  wardsignupBrevoApiKey,
} from "@/lib/email-cutover-config";
import { WARD_SIGNUP_FROM_EMAIL, wardSignupFrom } from "@/lib/email-from-policy";
import {
  applyClaim,
  applyExhaust,
  applyRelease,
  applyReserve,
  type AttemptRow,
  type ClaimInput,
  type QuotaRow,
  type RejectionClass,
  type ReserveOutcome,
} from "@/lib/email-quota-state";
import { utcDayStart, resendUtcDayCap } from "@/lib/email-deliver";
import { getResendForBrand } from "@/lib/resend-for-brand";

type Env = Record<string, string | undefined>;

export type CutoverDeps = {
  env: Env;
  now: () => Date;
  claim: (input: ClaimInput) => Promise<{ action: "send_primary" | "send_fallback" | "stop"; row: AttemptRow }>;
  markHttpStarted: (key: string) => Promise<void>;
  finish: (key: string, patch: Partial<AttemptRow> & { phase: AttemptRow["phase"] }) => Promise<void>;
  reserve: (provider: "brevo" | "resend", windowKey: string, recipients: number, cap: number | null) => Promise<ReserveOutcome>;
  release: (provider: "brevo" | "resend", windowKey: string, recipients: number) => Promise<void>;
  exhaust: (provider: "brevo" | "resend", windowKey: string) => Promise<void>;
  sendBrevo: (input: {
    apiKey: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    headers?: Record<string, string>;
    idempotencyKey: string;
    attachments?: DeliverParams["attachments"];
  }) => Promise<ProviderHttpResult>;
  sendResend: (input: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    headers?: Record<string, string>;
    idempotencyKey: string;
    attachments?: DeliverParams["attachments"];
  }) => Promise<ProviderHttpResult>;
};

function stopResult(row: AttemptRow): DeliverResult {
  if (row.phase === "primary_accepted" || row.phase === "fallback_accepted") {
    return {
      ok: true,
      provider: row.provider ?? (row.phase === "fallback_accepted" ? "resend" : "brevo"),
      messageId: row.messageId ?? undefined,
      duplicateSuppressed: true,
    };
  }
  if (
    row.phase === "primary_ambiguous" ||
    row.phase === "fallback_ambiguous" ||
    row.phase === "primary_inflight" ||
    row.phase === "fallback_inflight"
  ) {
    return {
      ok: false,
      error: "Delivery outcome is ambiguous or still in flight. No second provider was called.",
      ambiguous: true,
      duplicateSuppressed: true,
    };
  }
  return {
    ok: false,
    error: row.lastError || "Delivery already finished",
    terminal: true,
    duplicateSuppressed: true,
  };
}

function logCutover(kind: string | undefined, provider: "brevo" | "resend", outcome: string) {
  console.info(`[email] cutover provider=${provider} kind=${kind ?? "other"} outcome=${outcome}`);
}

async function sendFallback(
  params: DeliverParams,
  deps: CutoverDeps,
  recipients: string[],
  idempotencyKey: string,
  count: number,
  alreadyClaimed: boolean,
): Promise<DeliverResult> {
  if (!alreadyClaimed) {
    const again = await deps.claim({
      key: idempotencyKey,
      brandId: params.brand.id,
      kind: params.kind ?? "other",
      toAddress: recipients[0] ?? params.to,
      recipientCount: count,
    });
    if (again.action !== "send_fallback") return stopResult(again.row);
  }

  const windowKey = `utc:${utcDayStart(deps.now()).toISOString()}`;
  const cap = resendUtcDayCap(deps.env);
  const slot = await deps.reserve("resend", windowKey, count, cap);
  if (slot.result !== "reserved") {
    await deps.finish(idempotencyKey, {
      phase: "fallback_rejected",
      rejectionClass: "quota",
      provider: "resend",
      lastError: `resend budget ${slot.result}`,
    });
    return {
      ok: false,
      error: "Resend fallback budget is unavailable. No email was sent.",
      overBudget: true,
    };
  }

  await deps.markHttpStarted(idempotencyKey);
  let http: ProviderHttpResult;
  try {
    http = await deps.sendResend({
      from: `Jonathan <${WARD_SIGNUP_FROM_EMAIL}>`,
      to: recipients,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.headers,
      idempotencyKey,
      attachments: params.attachments,
    });
  } catch (e) {
    http = { status: null, body: e instanceof Error ? e.message : String(e), messageId: null };
  }
  const classified = classifyResendFallback(http);
  if (classified.kind === "accepted") {
    await deps.finish(idempotencyKey, {
      phase: "fallback_accepted",
      provider: "resend",
      messageId: classified.messageId,
      deliveryStatus: "accepted",
      lastError: null,
    });
    logCutover(params.kind, "resend", "accepted");
    return { ok: true, provider: "resend", messageId: classified.messageId };
  }
  if (classified.kind === "ambiguous") {
    await deps.finish(idempotencyKey, {
      phase: "fallback_ambiguous",
      provider: "resend",
      lastError: classified.reason,
    });
    logCutover(params.kind, "resend", "ambiguous");
    return {
      ok: false,
      error: `Resend fallback outcome is ambiguous (${classified.reason}). It was not retried.`,
      ambiguous: true,
    };
  }
  await deps.release("resend", windowKey, count);
  if (classified.kind === "quota") await deps.exhaust("resend", windowKey);
  await deps.finish(idempotencyKey, {
    phase: "fallback_rejected",
    rejectionClass: classified.kind === "quota" ? "quota" : "permanent",
    provider: "resend",
    lastError: classified.detail,
  });
  logCutover(params.kind, "resend", classified.kind);
  return {
    ok: false,
    error: classified.detail,
    overBudget: classified.kind === "quota",
    brevoFailed: true,
  };
}

/**
 * Brevo first for every Ward Signup kind. Resend is used once, inside its
 * UTC-day cap, only after Brevo definitively rejects the message (quota or
 * auth). Ambiguous Brevo results never reach Resend.
 */
export async function runBrevoCutover(
  params: DeliverParams,
  _opts: { urgent: boolean; realtime?: boolean },
  deps: CutoverDeps,
): Promise<DeliverResult> {
  const from = wardSignupFrom(params.brand.id);
  if (!from.ok) return { ok: false, error: from.error, terminal: true };

  const apiKey = wardsignupBrevoApiKey(deps.env);
  if (!apiKey) {
    return {
      ok: false,
      error: "Brevo cutover is not configured (WARDSIGNUP_BREVO_API_KEY missing). No fallback send.",
      terminal: true,
    };
  }

  const count = countEnvelopeRecipients(params.to);
  if (count < 1 || count > 20) {
    return { ok: false, error: `Refusing send with ${count} recipients`, terminal: true };
  }
  const recipients = params.to
    .split(/[,;]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes("@"));
  const idempotencyKey = params.idempotencyKey?.trim() || `ws/${randomUUID()}`;
  const claimInput: ClaimInput = {
    key: idempotencyKey,
    brandId: params.brand.id,
    kind: params.kind ?? "other",
    toAddress: recipients[0] ?? params.to.trim().toLowerCase(),
    recipientCount: count,
  };
  const claimed = await deps.claim(claimInput);
  if (claimed.action === "stop") return stopResult(claimed.row);
  if (claimed.action === "send_fallback") {
    return sendFallback(params, deps, recipients, idempotencyKey, count, true);
  }

  const windowKey = brevoWindowKey(deps.env);
  const cap = brevoRecipientCap(deps.env);
  const slot = await deps.reserve("brevo", windowKey, count, cap);
  if (slot.result === "unknown" || slot.result === "invalid") {
    await deps.finish(idempotencyKey, {
      phase: "primary_rejected",
      rejectionClass: "unknown",
      lastError: `brevo quota ${slot.result}`,
    });
    return {
      ok: false,
      error: "Brevo quota state is unknown. The send was refused and Resend was not called.",
      terminal: true,
    };
  }
  if (slot.result === "full" || slot.result === "exhausted") {
    await deps.finish(idempotencyKey, {
      phase: "primary_rejected",
      rejectionClass: "quota",
      lastError: `brevo quota ${slot.result}`,
    });
    return sendFallback(params, deps, recipients, idempotencyKey, count, false);
  }

  await deps.markHttpStarted(idempotencyKey);
  let http: ProviderHttpResult;
  try {
    http = await deps.sendBrevo({
      apiKey,
      to: recipients,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.headers,
      idempotencyKey,
      attachments: params.attachments,
    });
  } catch (e) {
    http = { status: null, body: e instanceof Error ? e.message : String(e), messageId: null };
  }
  const classified = classifyBrevoHttp(http);
  if (classified.kind === "accepted") {
    await deps.finish(idempotencyKey, {
      phase: "primary_accepted",
      provider: "brevo",
      messageId: classified.messageId,
      deliveryStatus: "accepted",
      lastError: null,
    });
    logCutover(params.kind, "brevo", "accepted");
    return { ok: true, provider: "brevo", messageId: classified.messageId };
  }
  if (classified.kind === "ambiguous") {
    await deps.finish(idempotencyKey, {
      phase: "primary_ambiguous",
      provider: "brevo",
      lastError: classified.reason,
    });
    logCutover(params.kind, "brevo", "ambiguous");
    return {
      ok: false,
      error: `Brevo outcome is ambiguous (${classified.reason}). Resend was not called.`,
      ambiguous: true,
    };
  }
  await deps.release("brevo", windowKey, count);
  if (classified.kind === "rate_limited") {
    await deps.finish(idempotencyKey, {
      phase: "primary_rejected",
      rejectionClass: "rate_limited",
      provider: "brevo",
      lastError: "brevo 429 rate limit",
    });
    logCutover(params.kind, "brevo", "rate_limited");
    return {
      ok: false,
      error: "Brevo rate limited the request. It was not accepted and Resend was not called.",
      retryable: true,
    };
  }
  if (classified.kind === "permanent") {
    await deps.finish(idempotencyKey, {
      phase: "primary_rejected",
      rejectionClass: "permanent",
      provider: "brevo",
      lastError: classified.detail,
    });
    logCutover(params.kind, "brevo", "permanent");
    return { ok: false, error: classified.detail, terminal: true, brevoFailed: true };
  }
  const rejectionClass: RejectionClass = classified.kind === "quota" ? "quota" : "auth";
  if (classified.kind === "quota") await deps.exhaust("brevo", windowKey);
  await deps.finish(idempotencyKey, {
    phase: "primary_rejected",
    rejectionClass,
    provider: "brevo",
    lastError: classified.detail,
  });
  logCutover(params.kind, "brevo", rejectionClass);
  return sendFallback(params, deps, recipients, idempotencyKey, count, false);
}

type MemoryState = {
  quotas: Map<string, QuotaRow>;
  attempts: Map<string, AttemptRow>;
  chain: Promise<void>;
};

function quotaKey(provider: string, windowKey: string): string {
  return `${provider}:${windowKey}`;
}

/** In-memory durable store. Mutations run one at a time, like the SQL row lock. */
export function createMemoryCutoverDeps(opts: {
  env: Env;
  now?: () => Date;
  sendBrevo: CutoverDeps["sendBrevo"];
  sendResend: CutoverDeps["sendResend"];
}): CutoverDeps & { state: MemoryState } {
  const state: MemoryState = {
    quotas: new Map(),
    attempts: new Map(),
    chain: Promise.resolve(),
  };
  const now = opts.now ?? (() => new Date());
  function serial<T>(fn: () => T): Promise<T> {
    const run = state.chain.then(fn);
    state.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  const deps: CutoverDeps & { state: MemoryState } = {
    env: opts.env,
    now,
    state,
    claim: (input) =>
      serial(() => {
        const current = state.attempts.get(input.key) ?? null;
        const next = applyClaim(current, input, now().getTime());
        state.attempts.set(input.key, next.row);
        return next;
      }),
    markHttpStarted: (key) =>
      serial(() => {
        const row = state.attempts.get(key);
        if (!row) return;
        state.attempts.set(key, { ...row, httpStarted: true, updatedAt: now().getTime() });
      }),
    finish: (key, patch) =>
      serial(() => {
        const row = state.attempts.get(key);
        if (!row) return;
        state.attempts.set(key, { ...row, ...patch, updatedAt: now().getTime() });
      }),
    reserve: (provider, windowKey, recipients, cap) =>
      serial(() => {
        const key = quotaKey(provider, windowKey);
        const applied = applyReserve(state.quotas.get(key) ?? null, recipients, cap);
        if (applied.row) state.quotas.set(key, applied.row);
        return applied.outcome;
      }),
    release: (provider, windowKey, recipients) =>
      serial(() => {
        const key = quotaKey(provider, windowKey);
        const next = applyRelease(state.quotas.get(key) ?? null, recipients);
        if (next) state.quotas.set(key, next);
      }),
    exhaust: (provider, windowKey) =>
      serial(() => {
        const key = quotaKey(provider, windowKey);
        state.quotas.set(key, applyExhaust(state.quotas.get(key) ?? null));
      }),
    sendBrevo: opts.sendBrevo,
    sendResend: opts.sendResend,
  };
  return deps;
}

export function productionCutoverDeps(env: Env = process.env): CutoverDeps {
  return {
    env,
    now: () => new Date(),
    claim: (input) => rpcClaim(input),
    markHttpStarted: (key) => rpcMark(key),
    finish: (key, patch) => rpcFinish(key, patch),
    reserve: (provider, windowKey, recipients, cap) => rpcReserve(provider, windowKey, recipients, cap),
    release: (provider, windowKey, recipients) => rpcRelease(provider, windowKey, recipients),
    exhaust: (provider, windowKey) => rpcExhaust(provider, windowKey),
    sendBrevo: async (input) =>
      postBrevoTransactional({
        apiKey: input.apiKey,
        senderEmail: WARD_SIGNUP_FROM_EMAIL,
        senderName: "Jonathan",
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        headers: input.headers,
        idempotencyKey: input.idempotencyKey,
        attachments: input.attachments,
      }),
    sendResend: async (input) => {
      const resend = getResendForBrand({ id: "wardsignup" });
      if (!resend) return { status: 401, body: JSON.stringify({ message: "resend key missing" }), messageId: null };
      try {
        const sent = await resend.emails.send(
          {
            from: input.from,
            to: input.to,
            subject: input.subject,
            html: input.html,
            ...(input.text ? { text: input.text } : {}),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
            ...(input.attachments?.length ? { attachments: input.attachments } : {}),
            ...(input.headers && Object.keys(input.headers).length ? { headers: input.headers } : {}),
          },
          { idempotencyKey: input.idempotencyKey },
        );
        if (sent.error) {
          const err = sent.error as { statusCode?: number | null; message?: string; name?: string };
          return {
            status: typeof err.statusCode === "number" ? err.statusCode : null,
            body: JSON.stringify({ code: err.name ?? "", message: err.message ?? "" }),
            messageId: null,
          };
        }
        const id = (sent.data as { id?: string } | null)?.id ?? null;
        return { status: 200, body: "", messageId: id };
      } catch (e) {
        return { status: null, body: e instanceof Error ? e.message : String(e), messageId: null };
      }
    },
  };
}

async function admin() {
  const { createServiceRoleClient } = await import("@/lib/supabase-admin");
  return createServiceRoleClient();
}

async function rpcClaim(input: ClaimInput): Promise<{ action: "send_primary" | "send_fallback" | "stop"; row: AttemptRow }> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_claim", {
      p_key: input.key,
      p_brand_id: input.brandId,
      p_kind: input.kind,
      p_to_address: input.toAddress,
      p_recipient_count: input.recipientCount,
      p_now: new Date().toISOString(),
    } as never);
    if (error || !data) throw new Error(error?.message ?? "empty claim");
    return data as { action: "send_primary" | "send_fallback" | "stop"; row: AttemptRow };
  } catch (e) {
    console.error("email_delivery_claim failed closed:", e instanceof Error ? e.message : "error");
    return {
      action: "stop",
      row: {
        key: input.key,
        brandId: input.brandId,
        kind: input.kind,
        toAddress: input.toAddress,
        recipientCount: input.recipientCount,
        tag: "",
        phase: "primary_ambiguous",
        rejectionClass: null,
        provider: null,
        messageId: null,
        httpStarted: true,
        lastError: "claim failed",
        updatedAt: Date.now(),
        deliveryStatus: null,
      },
    };
  }
}

async function rpcMark(key: string): Promise<void> {
  try {
    const client = await admin();
    await client.rpc("email_delivery_mark_http_started", { p_key: key, p_now: new Date().toISOString() } as never);
  } catch (e) {
    console.error("email_delivery_mark_http_started failed:", e instanceof Error ? e.message : "error");
  }
}

async function rpcFinish(key: string, patch: Partial<AttemptRow> & { phase: AttemptRow["phase"] }): Promise<void> {
  try {
    const client = await admin();
    const { error } = await client.rpc("email_delivery_finish", {
      p_key: key,
      p_phase: patch.phase,
      p_rejection_class: patch.rejectionClass ?? null,
      p_provider: patch.provider ?? null,
      p_message_id: patch.messageId ?? null,
      p_error: patch.lastError ?? null,
      p_delivery_status: patch.deliveryStatus ?? null,
      p_now: new Date().toISOString(),
    } as never);
    if (error) console.error("email_delivery_finish failed:", error.message);
  } catch (e) {
    console.error("email_delivery_finish failed:", e instanceof Error ? e.message : "error");
  }
}

async function rpcReserve(
  provider: "brevo" | "resend",
  windowKey: string,
  recipients: number,
  cap: number | null,
): Promise<ReserveOutcome> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("reserve_email_provider_quota", {
      p_provider: provider,
      p_window_key: windowKey,
      p_recipients: recipients,
      p_cap: cap,
    } as never);
    if (error || !data) return { result: "unknown" };
    return data as ReserveOutcome;
  } catch {
    return { result: "unknown" };
  }
}

async function rpcRelease(provider: "brevo" | "resend", windowKey: string, recipients: number): Promise<void> {
  try {
    const client = await admin();
    await client.rpc("release_email_provider_quota", {
      p_provider: provider,
      p_window_key: windowKey,
      p_recipients: recipients,
    } as never);
  } catch (e) {
    console.error("release_email_provider_quota failed:", e instanceof Error ? e.message : "error");
  }
}

async function rpcExhaust(provider: "brevo" | "resend", windowKey: string): Promise<void> {
  try {
    const client = await admin();
    await client.rpc("exhaust_email_provider_quota", {
      p_provider: provider,
      p_window_key: windowKey,
    } as never);
  } catch (e) {
    console.error("exhaust_email_provider_quota failed:", e instanceof Error ? e.message : "error");
  }
}

