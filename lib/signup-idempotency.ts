/**
 * Signup retry safety without a new table (no migration).
 *
 * 1. A client-generated UUID is reused across automatic 503 retries of the
 *    same submit. An in-memory store on this isolate returns the first
 *    result so a second produce() is not started.
 * 2. When the visitor left an email, a retry can also reuse a recent signup
 *    on the same slot with that email (works across isolates). We never
 *    dedupe on name alone: two people in the same ward can share a first name.
 */

export const SIGNUP_IDEMPOTENCY_WINDOW_MS = 30 * 60_000;
export const SIGNUP_IDEMPOTENCY_MEMORY_TTL_MS = 15 * 60_000;

const KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function newSignupIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function parseSignupIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return KEY_RE.test(key) ? key.toLowerCase() : null;
}

export function normalizeSignupEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

export type SignupEmailRow = {
  session_id: string;
  member_email?: string | null;
  signed_up_at: string;
};

/**
 * Find a recent signup on this slot with the same email so a 503 retry does
 * not insert a second row. Returns null when there is no email: name-only
 * matching would collapse two different people with the same name.
 */
export function findReusableEmailSignup<T extends SignupEmailRow>(
  existing: T[],
  opts: {
    sessionId: string;
    memberEmail: unknown;
    now?: Date;
    windowMs?: number;
  },
): T | null {
  const email = normalizeSignupEmail(opts.memberEmail);
  if (!email) return null;
  const now = (opts.now ?? new Date()).getTime();
  const windowMs = opts.windowMs ?? SIGNUP_IDEMPOTENCY_WINDOW_MS;
  for (const row of existing) {
    if (row.session_id !== opts.sessionId) continue;
    if (normalizeSignupEmail(row.member_email) !== email) continue;
    const at = new Date(row.signed_up_at).getTime();
    if (!Number.isFinite(at)) continue;
    const age = now - at;
    if (age >= 0 && age <= windowMs) return row;
  }
  return null;
}

export type ItemSignupEmailRow = {
  item_id?: string | null;
  custom_label?: string | null;
  member_email?: string | null;
  signed_up_at: string;
};

export function findReusableEmailItemSignup<T extends ItemSignupEmailRow>(
  existing: T[],
  opts: {
    itemId?: string | null;
    customLabel?: string | null;
    memberEmail: unknown;
    now?: Date;
    windowMs?: number;
  },
): T | null {
  const email = normalizeSignupEmail(opts.memberEmail);
  if (!email) return null;
  const now = (opts.now ?? new Date()).getTime();
  const windowMs = opts.windowMs ?? SIGNUP_IDEMPOTENCY_WINDOW_MS;
  const itemId = opts.itemId || null;
  const customLabel = (opts.customLabel ?? "").trim() || null;
  for (const row of existing) {
    if (normalizeSignupEmail(row.member_email) !== email) continue;
    const rowItem = row.item_id || null;
    const rowLabel = (row.custom_label ?? "").trim() || null;
    if (itemId) {
      if (rowItem !== itemId) continue;
    } else if (customLabel) {
      if (rowLabel !== customLabel) continue;
    } else {
      continue;
    }
    const at = new Date(row.signed_up_at).getTime();
    if (!Number.isFinite(at)) continue;
    const age = now - at;
    if (age >= 0 && age <= windowMs) return row;
  }
  return null;
}

export interface IdempotencyStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const memory = new Map<string, { value: unknown; expiresAt: number }>();

export function clearSignupIdempotencyMemory(): void {
  memory.clear();
}

export function memoryIdempotencyStore(
  now: () => number = Date.now,
  ttlMs: number = SIGNUP_IDEMPOTENCY_MEMORY_TTL_MS,
): IdempotencyStore {
  return {
    async get(key) {
      const hit = memory.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt < now()) {
        memory.delete(key);
        return undefined;
      }
      return hit.value;
    },
    async set(key, value) {
      memory.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}

/**
 * If `key` was already completed in `store`, return that value and skip
 * `produce`. Otherwise run it once and remember the result.
 */
export async function withIdempotency<T>(
  key: string | null,
  store: IdempotencyStore,
  produce: () => Promise<T>,
): Promise<{ value: T; reused: boolean }> {
  if (!key) return { value: await produce(), reused: false };
  const existing = await store.get(key);
  if (existing !== undefined) return { value: existing as T, reused: true };
  const value = await produce();
  await store.set(key, value);
  return { value, reused: false };
}
