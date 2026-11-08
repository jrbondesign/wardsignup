import { idempotencyTag } from "@/lib/email-cutover-config";

/**
 * Quota and idempotency transitions for the Brevo cutover.
 *
 * The database functions in
 * supabase/migrations/20261108183000_email_provider_cutover.sql are the
 * durable copy of these transitions (row locks). Tests drive this module
 * directly and through the in-memory store. Brevo's daily reset clock is
 * not known, so a window never expires by time. A new BREVO_QUOTA_WINDOW_ID
 * is a new row. Exhaustion stays latched on the current window.
 */

export type QuotaRow = {
  reserved: number;
  exhausted: boolean;
  /** External usage captured when this window opened. Releases cannot pass it. */
  seed?: number;
};

export type ReserveOutcome =
  | { result: "reserved"; reserved: number }
  | { result: "full"; reserved: number; cap: number }
  | { result: "exhausted"; reserved: number }
  | { result: "unknown" }
  | { result: "invalid" };

export function applyReserve(
  row: QuotaRow | null,
  recipients: number,
  cap: number | null,
  seed: number | null,
): { row: QuotaRow | null; outcome: ReserveOutcome } {
  if (!Number.isInteger(recipients) || recipients < 1 || recipients > 20) {
    return { row, outcome: { result: "invalid" } };
  }
  if (row?.exhausted) {
    return { row, outcome: { result: "exhausted", reserved: row.reserved } };
  }
  if (cap === null || !Number.isInteger(cap) || cap < 1) {
    return { row, outcome: { result: "unknown" } };
  }
  // A missing row is not "zero used". The seed is the dashboard's already-used
  // count and is written in the same step as the first reservation. An
  // existing row keeps its counter; a later seed change does not rewind it.
  if (!row && (seed === null || !Number.isInteger(seed) || seed < 0)) {
    return { row, outcome: { result: "unknown" } };
  }
  const current = row ?? { reserved: seed ?? 0, exhausted: false, seed: seed ?? 0 };
  if (current.reserved + recipients > cap) {
    return { row: current, outcome: { result: "full", reserved: current.reserved, cap } };
  }
  const next = { ...current, reserved: current.reserved + recipients };
  return { row: next, outcome: { result: "reserved", reserved: next.reserved } };
}

export function applyRelease(row: QuotaRow | null, recipients: number): QuotaRow | null {
  if (!row) return row;
  const n = Number.isInteger(recipients) && recipients > 0 ? recipients : 0;
  const floor = row.seed ?? 0;
  return { ...row, reserved: Math.max(floor, row.reserved - n) };
}

export function applyExhaust(row: QuotaRow | null): QuotaRow {
  return { reserved: row?.reserved ?? 0, exhausted: true };
}

export type DeliveryPhase =
  | "primary_inflight"
  | "primary_accepted"
  | "primary_ambiguous"
  | "primary_rejected"
  | "fallback_inflight"
  | "fallback_accepted"
  | "fallback_ambiguous"
  | "fallback_rejected";

export type RejectionClass = "quota" | "auth" | "rate_limited" | "permanent" | "unknown";

export type AttemptRow = {
  key: string;
  brandId: string;
  kind: string;
  toAddress: string;
  recipientCount: number;
  /** Sanitized idempotency tag echoed by Brevo so a webhook can find the row. */
  tag: string;
  phase: DeliveryPhase;
  rejectionClass: RejectionClass | null;
  provider: "brevo" | "resend" | null;
  messageId: string | null;
  httpStarted: boolean;
  /** True only after a reservation for this attempt committed. */
  quotaHeld: boolean;
  lastError: string | null;
  updatedAt: number;
  deliveryStatus: DeliveryStatus | null;
};

export type ClaimInput = {
  key: string;
  brandId: string;
  kind: string;
  toAddress: string;
  recipientCount: number;
  operationScope?: string | null;
};

export type ClaimAction = "send_primary" | "send_fallback" | "stop";

/**
 * An in-flight row that has already touched the provider and is older than
 * this is closed as ambiguous. A row that never started HTTP stays retryable
 * no matter how old it is.
 */
export const INFLIGHT_STALE_MS = 60_000;

export function applyClaim(
  row: AttemptRow | null,
  input: ClaimInput,
  nowMs: number,
): { row: AttemptRow; action: ClaimAction } {
  if (!row) {
    return {
      action: "send_primary",
      row: {
        key: input.key,
        brandId: input.brandId,
        kind: input.kind,
        toAddress: input.toAddress,
        recipientCount: input.recipientCount,
        tag: idempotencyTag(input.key),
        phase: "primary_inflight",
        rejectionClass: null,
        provider: null,
        messageId: null,
        httpStarted: false,
        quotaHeld: false,
        lastError: null,
        updatedAt: nowMs,
        deliveryStatus: null,
      },
    };
  }

  const stale = nowMs - row.updatedAt >= INFLIGHT_STALE_MS;
  if (row.phase === "primary_inflight" || row.phase === "fallback_inflight") {
    if (row.httpStarted) {
      if (!stale) return { action: "stop", row };
      const phase = row.phase === "primary_inflight" ? "primary_ambiguous" : "fallback_ambiguous";
      return {
        action: "stop",
        row: { ...row, phase, updatedAt: nowMs, lastError: row.lastError ?? "inflight closed as ambiguous" },
      };
    }
    const action = row.phase === "fallback_inflight" ? "send_fallback" : "send_primary";
    return { action, row: { ...row, updatedAt: nowMs } };
  }

  if (row.phase === "primary_rejected" && row.rejectionClass === "rate_limited") {
    return {
      action: "send_primary",
      row: { ...row, phase: "primary_inflight", httpStarted: false, updatedAt: nowMs },
    };
  }
  if (row.phase === "primary_rejected" && row.rejectionClass === "unknown" && !row.httpStarted) {
    return {
      action: "send_primary",
      row: { ...row, phase: "primary_inflight", httpStarted: false, updatedAt: nowMs },
    };
  }
  if (row.phase === "primary_rejected" && (row.rejectionClass === "quota" || row.rejectionClass === "auth")) {
    return {
      action: "send_fallback",
      row: { ...row, phase: "fallback_inflight", httpStarted: false, provider: "resend", updatedAt: nowMs },
    };
  }
  if (row.phase === "fallback_rejected" && row.rejectionClass === "unknown" && !row.httpStarted) {
    return {
      action: "send_fallback",
      row: { ...row, phase: "fallback_inflight", httpStarted: false, provider: "resend", updatedAt: nowMs },
    };
  }
  return { action: "stop", row };
}

export type DeliveryStatus = "accepted" | "deferred" | "delivered" | "bounced" | "complained" | "suppressed";

const STATUS_RANK: Record<DeliveryStatus, number> = {
  accepted: 1,
  deferred: 2,
  delivered: 3,
  bounced: 4,
  complained: 4,
  suppressed: 4,
};

/** Terminal provider states do not move backwards or flip between each other. */
export function nextDeliveryStatus(
  current: DeliveryStatus | null,
  incoming: DeliveryStatus,
): DeliveryStatus {
  if (!current) return incoming;
  const from = STATUS_RANK[current];
  const to = STATUS_RANK[incoming];
  if (to < from) return current;
  if (from === 4 && to === 4) return current;
  return incoming;
}
