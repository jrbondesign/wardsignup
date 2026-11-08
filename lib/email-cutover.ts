import type { DeliverParams, DeliverResult } from "@/lib/email-deliver";
import {
  classifyBrevoHttp,
  classifyResendFallback,
  type ProviderHttpResult,
} from "@/lib/email-brevo-classify";
import { postBrevoTransactional } from "@/lib/email-brevo-transport";
import {
  brevoQuotaSeed,
  brevoRecipientCap,
  brevoWindowKey,
  countEnvelopeRecipients,
  isBrevoCutoverEnabled,
  wardsignupBrevoApiKey,
} from "@/lib/email-cutover-config";
import { consumeSharedResendBudget } from "@/lib/email-deliver";
import { emailOutboundBlock } from "@/lib/email-outbound";
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
import { resendDailySoftLimit, resendUtcDayCap, utcDayStart } from "@/lib/email-deliver";
import { getResendForBrand } from "@/lib/resend-for-brand";

type Env = Record<string, string | undefined>;

export type CutoverDeps = {
  env: Env;
  now: () => Date;
  claim: (input: ClaimInput) => Promise<
    | { action: "send_primary" | "send_fallback" | "stop"; row: AttemptRow }
    | { action: "unavailable" }
  >;
  markHttpStarted: (key: string) => Promise<boolean>;
  markQuotaHeld: (key: string, held: boolean) => Promise<boolean>;
  clearHttp: (key: string) => Promise<boolean>;
  finish: (key: string, patch: Partial<AttemptRow> & { phase: AttemptRow["phase"] }) => Promise<boolean>;
  reserve: (
    provider: "brevo" | "resend",
    windowKey: string,
    recipients: number,
    cap: number | null,
    seed: number | null,
  ) => Promise<ReserveOutcome>;
  /**
   * Refund this attempt and clear quota_held in one step.
   * already_released does not decrement. unavailable means the counter was not touched.
   */
  releaseHeld: (
    key: string,
    provider: "brevo" | "resend",
    windowKey: string,
    recipients: number,
  ) => Promise<"released" | "already_released" | "missing" | "unavailable">;
  exhaust: (provider: "brevo" | "resend", windowKey: string) => Promise<void>;
  consumeResend: (brandId: string, recipients: number) => Promise<"reserved" | "full" | "unknown">;
  /** bounce/complaint block every kind. unsubscribe blocks notification kinds. unknown blocks notification kinds only. */
  recipientBlock: (email: string, kind: string) => Promise<"allow" | "hard" | "unsubscribe" | "unknown">;
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

const RESERVE_RESULTS = new Set(["reserved", "full", "exhausted", "unknown", "invalid"]);

const TRANSACTIONAL_KINDS = new Set(["magic_link", "signup_confirmation", "org_invite_link", "welcome"]);

function knownReserve(slot: ReserveOutcome | null | undefined): ReserveOutcome {
  if (!slot || typeof slot.result !== "string" || !RESERVE_RESULTS.has(slot.result)) {
    return { result: "unknown" };
  }
  return slot;
}

function stopResult(row: AttemptRow): DeliverResult {
  if (row.phase === "primary_accepted" || row.phase === "fallback_accepted") {
    return {
      ok: true,
      provider: row.provider ?? (row.phase === "fallback_accepted" ? "resend" : "brevo"),
      messageId: row.messageId ?? undefined,
      duplicateSuppressed: true,
    };
  }
  const inflight = row.phase === "primary_inflight" || row.phase === "fallback_inflight";
  if (inflight && !row.httpStarted) {
    return {
      ok: false,
      error: "Delivery has not reached a provider. It can be retried. No second provider was called.",
      retryable: true,
    };
  }
  if (inflight || row.phase === "primary_ambiguous" || row.phase === "fallback_ambiguous") {
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

async function finishRecorded(
  deps: CutoverDeps,
  key: string,
  patch: Partial<AttemptRow> & { phase: AttemptRow["phase"] },
  httpWasUncertain: boolean,
): Promise<"ok" | "retry" | "ambiguous"> {
  const wrote = await deps.finish(key, patch);
  if (wrote) return "ok";
  if (httpWasUncertain) return "ambiguous";
  await deps.clearHttp(key);
  return "retry";
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
      operationScope: params.operationScope ?? null,
    });
    if (again.action === "unavailable") {
      return { ok: false, error: "Delivery claim could not be recorded. No provider was called.", retryable: true };
    }
    if (again.action !== "send_fallback") return stopResult(again.row);
  }

  // Same Resend counters the live path already increments. Not a fresh 100.
  const slot = await deps.consumeResend(params.brand.id, count);
  if (slot !== "reserved") {
    const wrote = await finishRecorded(
      deps,
      idempotencyKey,
      {
        phase: "fallback_rejected",
        rejectionClass: slot === "unknown" ? "unknown" : "quota",
        provider: "resend",
        httpStarted: false,
        lastError: `resend budget ${slot}`,
      },
      false,
    );
    if (wrote === "ambiguous") {
      return { ok: false, error: "Resend budget outcome could not be recorded.", ambiguous: true };
    }
    if (slot === "unknown" || wrote === "retry") {
      return { ok: false, error: "Resend fallback budget could not be read. No email was sent.", retryable: true };
    }
    return {
      ok: false,
      error: "Resend fallback budget is unavailable. No email was sent.",
      overBudget: true,
    };
  }

  const started = await deps.markHttpStarted(idempotencyKey);
  if (!started) {
    return { ok: false, error: "Could not record the Resend attempt. No request was sent.", retryable: true };
  }
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
    const wrote = await finishRecorded(
      deps,
      idempotencyKey,
      {
        phase: "fallback_accepted",
        provider: "resend",
        messageId: classified.messageId,
        deliveryStatus: "accepted",
        lastError: null,
      },
      true,
    );
    if (wrote !== "ok") {
      return { ok: false, error: "Resend accepted the message and the receipt could not be stored.", ambiguous: true };
    }
    logCutover(params.kind, "resend", "accepted");
    return { ok: true, provider: "resend", messageId: classified.messageId };
  }
  if (classified.kind === "ambiguous") {
    await finishRecorded(
      deps,
      idempotencyKey,
      { phase: "fallback_ambiguous", provider: "resend", lastError: classified.reason },
      true,
    );
    logCutover(params.kind, "resend", "ambiguous");
    return {
      ok: false,
      error: `Resend fallback outcome is ambiguous (${classified.reason}). It was not retried.`,
      ambiguous: true,
    };
  }
  const wrote = await finishRecorded(
    deps,
    idempotencyKey,
    {
      phase: "fallback_rejected",
      rejectionClass: classified.kind === "quota" ? "quota" : "permanent",
      provider: "resend",
      lastError: classified.detail,
    },
    false,
  );
  logCutover(params.kind, "resend", classified.kind);
  if (wrote !== "ok") {
    return { ok: false, error: "Resend rejected the message and the receipt could not be stored.", retryable: true };
  }
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
  const idempotencyKey = params.idempotencyKey?.trim() ?? "";
  if (!idempotencyKey) {
    return {
      ok: false,
      error: "Refusing a cutover send without a stable idempotency key. No provider was called.",
      terminal: true,
    };
  }
  const block = await deps.recipientBlock(recipients[0] ?? "", params.kind ?? "other");
  if (block === "hard" || (block === "unsubscribe" && !TRANSACTIONAL_KINDS.has(params.kind ?? ""))) {
    return {
      ok: false,
      error: block === "hard"
        ? "Recipient is suppressed after a hard bounce or complaint. No email was sent."
        : "Recipient is unsubscribed. No notification was sent.",
      terminal: true,
    };
  }
  if (block === "unknown" && !TRANSACTIONAL_KINDS.has(params.kind ?? "")) {
    return {
      ok: false,
      error: "Suppression list could not be read. No notification was sent.",
      retryable: true,
    };
  }

  const claimInput: ClaimInput = {
    key: idempotencyKey,
    brandId: params.brand.id,
    kind: params.kind ?? "other",
    toAddress: recipients[0] ?? params.to.trim().toLowerCase(),
    recipientCount: count,
    operationScope: params.operationScope ?? null,
  };
  const claimed = await deps.claim(claimInput);
  if (claimed.action === "unavailable") {
    return { ok: false, error: "Delivery claim could not be recorded. No provider was called.", retryable: true };
  }
  if (claimed.action === "stop") return stopResult(claimed.row);
  if (claimed.action === "send_fallback") {
    return sendFallback(params, deps, recipients, idempotencyKey, count, true);
  }

  const windowKey = brevoWindowKey(deps.env);
  const cap = brevoRecipientCap(deps.env);
  const seed = brevoQuotaSeed(deps.env);
  let held = claimed.row.quotaHeld;
  if (!held) {
    const slot = knownReserve(await deps.reserve("brevo", windowKey, count, cap, seed));
    if (slot.result !== "reserved") {
      const wrote = await finishRecorded(
        deps,
        idempotencyKey,
        {
          phase: "primary_rejected",
          rejectionClass: slot.result === "full" || slot.result === "exhausted" ? "quota" : "unknown",
          httpStarted: false,
          lastError: `brevo quota ${slot.result}`,
        },
        false,
      );
      if (wrote !== "ok") {
        return { ok: false, error: "Brevo quota state could not be recorded. No provider was called.", retryable: true };
      }
      if (slot.result === "full" || slot.result === "exhausted") {
        return sendFallback(params, deps, recipients, idempotencyKey, count, false);
      }
      return {
        ok: false,
        error: "Brevo quota state is unknown. The send was refused and Resend was not called.",
        retryable: true,
      };
    }
    held = await deps.markQuotaHeld(idempotencyKey, true);
    if (!held) {
      return {
        ok: false,
        error: "Brevo reservation could not be recorded. No provider was called.",
        retryable: true,
      };
    }
  }

  const started = await deps.markHttpStarted(idempotencyKey);
  if (!started) {
    return { ok: false, error: "Could not record that the Brevo call was starting. No request was sent.", retryable: true };
  }
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
    const wrote = await finishRecorded(
      deps,
      idempotencyKey,
      {
        phase: "primary_accepted",
        provider: "brevo",
        messageId: classified.messageId,
        deliveryStatus: "accepted",
        lastError: null,
      },
      true,
    );
    if (wrote !== "ok") {
      return { ok: false, error: "Brevo accepted the message and the receipt could not be stored. Resend was not called.", ambiguous: true };
    }
    logCutover(params.kind, "brevo", "accepted");
    return { ok: true, provider: "brevo", messageId: classified.messageId };
  }
  if (classified.kind === "ambiguous") {
    await finishRecorded(
      deps,
      idempotencyKey,
      { phase: "primary_ambiguous", provider: "brevo", lastError: classified.reason },
      true,
    );
    logCutover(params.kind, "brevo", "ambiguous");
    return {
      ok: false,
      error: `Brevo outcome is ambiguous (${classified.reason}). Resend was not called.`,
      ambiguous: true,
    };
  }
  if (classified.kind === "rate_limited") {
    const wrote = await finishRecorded(
      deps,
      idempotencyKey,
      {
        phase: "primary_rejected",
        rejectionClass: "rate_limited",
        provider: "brevo",
        httpStarted: false,
        lastError: "brevo 429 rate limit",
      },
      false,
    );
    if (wrote !== "ok") {
      return { ok: false, error: "Brevo rate limited the request and the receipt could not be stored.", retryable: true };
    }
    const released = await deps.releaseHeld(idempotencyKey, "brevo", windowKey, count);
    if (released === "unavailable" || released === "missing") {
      return {
        ok: false,
        error: "Brevo rate limited the request and the reservation could not be released. It was not refunded twice.",
        retryable: true,
      };
    }
    logCutover(params.kind, "brevo", "rate_limited");
    return {
      ok: false,
      error: "Brevo rate limited the request. It was not accepted and Resend was not called.",
      retryable: true,
    };
  }
  if (classified.kind === "permanent") {
    const wrote = await finishRecorded(
      deps,
      idempotencyKey,
      {
        phase: "primary_rejected",
        rejectionClass: "permanent",
        provider: "brevo",
        lastError: classified.detail,
      },
      false,
    );
    if (wrote === "ok") {
      await deps.releaseHeld(idempotencyKey, "brevo", windowKey, count);
    }
    logCutover(params.kind, "brevo", "permanent");
    return wrote === "ok"
      ? { ok: false, error: classified.detail, terminal: true, brevoFailed: true }
      : { ok: false, error: "Brevo rejected the message and the receipt could not be stored.", retryable: true };
  }
  const rejectionClass: RejectionClass = classified.kind === "quota" ? "quota" : "auth";
  const wrote = await finishRecorded(
    deps,
    idempotencyKey,
    {
      phase: "primary_rejected",
      rejectionClass,
      provider: "brevo",
      lastError: classified.detail,
    },
    false,
  );
  if (wrote !== "ok") {
    logCutover(params.kind, "brevo", "finish_failed");
    return {
      ok: false,
      error: "Brevo rejected the message and the receipt could not be stored. Resend was not called.",
      retryable: true,
    };
  }
  const released = await deps.releaseHeld(idempotencyKey, "brevo", windowKey, count);
  if (released === "unavailable" || released === "missing") {
    logCutover(params.kind, "brevo", "release_failed");
    return {
      ok: false,
      error: "Brevo rejected the message and the reservation could not be released. Resend was not called.",
      retryable: true,
    };
  }
  if (classified.kind === "quota") await deps.exhaust("brevo", windowKey);
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

/** Test double of the shared Resend counters. `RESEND_ALREADY_USED` is not read in production. */
function consumeMemoryResend(
  state: MemoryState,
  env: Env,
  now: Date,
  _brandId: string,
  recipients: number,
): "reserved" | "full" | "unknown" {
  if (!Number.isInteger(recipients) || recipients < 1) return "unknown";
  const cap = Math.min(resendUtcDayCap(env), resendDailySoftLimit(env));
  if (!Number.isInteger(cap) || cap < 1) return "unknown";
  const raw = env.RESEND_ALREADY_USED?.trim();
  const seeded = raw === undefined || raw === "" ? 0 : Number(raw);
  if (!Number.isInteger(seeded) || seeded < 0) return "unknown";
  const key = `resend-shared:${utcDayStart(now).toISOString()}`;
  const row = state.quotas.get(key) ?? { reserved: seeded, exhausted: false };
  if (row.reserved + recipients > cap) {
    state.quotas.set(key, row);
    return "full";
  }
  state.quotas.set(key, { ...row, reserved: row.reserved + recipients });
  return "reserved";
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
        if (!row) return false;
        state.attempts.set(key, { ...row, httpStarted: true, updatedAt: now().getTime() });
        return true;
      }),
    markQuotaHeld: (key, held) =>
      serial(() => {
        const row = state.attempts.get(key);
        if (!row) return false;
        state.attempts.set(key, { ...row, quotaHeld: held, updatedAt: now().getTime() });
        return true;
      }),
    clearHttp: (key) =>
      serial(() => {
        const row = state.attempts.get(key);
        if (!row) return false;
        if (row.phase !== "primary_inflight" && row.phase !== "fallback_inflight") return false;
        state.attempts.set(key, { ...row, httpStarted: false, updatedAt: now().getTime() });
        return true;
      }),
    finish: (key, patch) =>
      serial(() => {
        const row = state.attempts.get(key);
        if (!row) return false;
        state.attempts.set(key, { ...row, ...patch, updatedAt: now().getTime() });
        return true;
      }),
    reserve: (provider, windowKey, recipients, cap, seed) =>
      serial(() => {
        const key = quotaKey(provider, windowKey);
        const applied = applyReserve(state.quotas.get(key) ?? null, recipients, cap, seed);
        if (applied.row) state.quotas.set(key, applied.row);
        return applied.outcome;
      }),
    releaseHeld: (key, provider, windowKey, recipients) =>
      serial(() => {
        const row = state.attempts.get(key);
        if (!row) return "missing";
        if (!row.quotaHeld) return "already_released";
        const qk = quotaKey(provider, windowKey);
        const next = applyRelease(state.quotas.get(qk) ?? null, recipients);
        if (next) state.quotas.set(qk, next);
        state.attempts.set(key, { ...row, quotaHeld: false, updatedAt: now().getTime() });
        return "released";
      }),
    exhaust: (provider, windowKey) =>
      serial(() => {
        const key = quotaKey(provider, windowKey);
        state.quotas.set(key, applyExhaust(state.quotas.get(key) ?? null));
      }),
    consumeResend: (brandId, recipients) =>
      serial(() => consumeMemoryResend(state, opts.env, now(), brandId, recipients)),
    recipientBlock: async () => "allow",
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
    markQuotaHeld: (key, held) => rpcQuotaHeld(key, held),
    clearHttp: (key) => rpcClearHttp(key),
    finish: (key, patch) => rpcFinish(key, patch),
    reserve: (provider, windowKey, recipients, cap, seed) => rpcReserve(provider, windowKey, recipients, cap, seed),
    releaseHeld: (key, provider, windowKey, recipients) => rpcReleaseHeld(key, provider, windowKey, recipients),
    exhaust: (provider, windowKey) => rpcExhaust(provider, windowKey),
    consumeResend: (brandId, recipients) => consumeSharedResendBudget(brandId, recipients, new Date(), env),
    recipientBlock: (email, kind) => rpcRecipientBlock(email, kind),
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

async function rpcClaim(
  input: ClaimInput,
): Promise<{ action: "send_primary" | "send_fallback" | "stop"; row: AttemptRow } | { action: "unavailable" }> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_claim", {
      p_key: input.key,
      p_brand_id: input.brandId,
      p_kind: input.kind,
      p_to_address: input.toAddress,
      p_recipient_count: input.recipientCount,
      p_now: new Date().toISOString(),
      p_scope: input.operationScope ?? null,
    } as never);
    if (error || !data || typeof data !== "object") throw new Error(error?.message ?? "empty claim");
    const action = (data as { action?: unknown }).action;
    if (action !== "send_primary" && action !== "send_fallback" && action !== "stop") {
      throw new Error("unexpected claim");
    }
    return data as { action: "send_primary" | "send_fallback" | "stop"; row: AttemptRow };
  } catch (e) {
    console.error("email_delivery_claim failed closed:", e instanceof Error ? e.message : "error");
    return { action: "unavailable" };
  }
}

async function rpcMark(key: string): Promise<boolean> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_mark_http_started", {
      p_key: key,
      p_now: new Date().toISOString(),
    } as never);
    if (error) return false;
    return data === true;
  } catch (e) {
    console.error("email_delivery_mark_http_started failed:", e instanceof Error ? e.message : "error");
    return false;
  }
}

async function rpcQuotaHeld(key: string, held: boolean): Promise<boolean> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_mark_quota_held", {
      p_key: key,
      p_held: held,
      p_now: new Date().toISOString(),
    } as never);
    if (error) return false;
    return data === true;
  } catch (e) {
    console.error("email_delivery_mark_quota_held failed:", e instanceof Error ? e.message : "error");
    return false;
  }
}

async function rpcClearHttp(key: string): Promise<boolean> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_clear_http", {
      p_key: key,
      p_now: new Date().toISOString(),
    } as never);
    if (error) return false;
    return data === true;
  } catch (e) {
    console.error("email_delivery_clear_http failed:", e instanceof Error ? e.message : "error");
    return false;
  }
}

async function rpcFinish(key: string, patch: Partial<AttemptRow> & { phase: AttemptRow["phase"] }): Promise<boolean> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_finish", {
      p_key: key,
      p_phase: patch.phase,
      p_rejection_class: patch.rejectionClass ?? null,
      p_provider: patch.provider ?? null,
      p_message_id: patch.messageId ?? null,
      p_error: patch.lastError ?? null,
      p_delivery_status: patch.deliveryStatus ?? null,
      p_http_started: patch.httpStarted ?? null,
      p_now: new Date().toISOString(),
    } as never);
    if (error) {
      console.error("email_delivery_finish failed:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("email_delivery_finish failed:", e instanceof Error ? e.message : "error");
    return false;
  }
}

async function rpcReserve(
  provider: "brevo" | "resend",
  windowKey: string,
  recipients: number,
  cap: number | null,
  seed: number | null,
): Promise<ReserveOutcome> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("reserve_email_provider_quota", {
      p_provider: provider,
      p_window_key: windowKey,
      p_recipients: recipients,
      p_cap: cap,
      p_seed: seed,
    } as never);
    if (error || !data || typeof data !== "object") return { result: "unknown" };
    return knownReserve(data as ReserveOutcome);
  } catch {
    return { result: "unknown" };
  }
}

const HARD_SUPPRESS = new Set(["bounce", "complaint"]);
const UNSUB_SUPPRESS = new Set(["unsubscribe", "manual"]);

async function rpcRecipientBlock(
  email: string,
  kind: string,
): Promise<"allow" | "hard" | "unsubscribe" | "unknown"> {
  try {
    const client = await admin();
    const { data, error } = await client
      .from("email_suppressions")
      .select("reason")
      .eq("email_lower", email.trim().toLowerCase())
      .maybeSingle();
    if (error) return "unknown";
    const reason = (data as { reason?: string } | null)?.reason ?? null;
    if (reason && HARD_SUPPRESS.has(reason)) return "hard";
    if (reason && UNSUB_SUPPRESS.has(reason)) return TRANSACTIONAL_KINDS.has(kind) ? "allow" : "unsubscribe";
    return "allow";
  } catch {
    return "unknown";
  }
}

export async function cutoverBlocksNewLogin(scope: string, env: Env = process.env): Promise<boolean> {
  if (!isBrevoCutoverEnabled(env) || emailOutboundBlock(env).blocked) return false;
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_has_recent_uncertainty", {
      p_scope: scope,
      p_within_seconds: 600,
    } as never);
    if (error) return true;
    return data === true;
  } catch {
    // A failed lookup cannot prove the last attempt was not accepted.
    return true;
  }
}

async function rpcReleaseHeld(
  key: string,
  provider: "brevo" | "resend",
  windowKey: string,
  recipients: number,
): Promise<"released" | "already_released" | "missing" | "unavailable"> {
  try {
    const client = await admin();
    const { data, error } = await client.rpc("email_delivery_release_held", {
      p_key: key,
      p_provider: provider,
      p_window_key: windowKey,
      p_recipients: recipients,
      p_now: new Date().toISOString(),
    } as never);
    if (error) return "unavailable";
    if (data === "released" || data === "already_released" || data === "missing") return data;
    return "unavailable";
  } catch (e) {
    console.error("email_delivery_release_held failed:", e instanceof Error ? e.message : "error");
    return "unavailable";
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

