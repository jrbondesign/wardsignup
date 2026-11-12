/**
 * Signup retry safety without a new table (no migration).
 *
 * 1. A client-generated UUID is reused across automatic 503 retries of the
 *    same submit, and across a later manual resubmit of the same item in
 *    this tab (sessionStorage). An in-memory store on this isolate returns
 *    the first result so a second produce() is not started.
 * 2. When the visitor left an email, a retry can also reuse a recent signup
 *    on the same slot or item with that email (works across isolates).
 * 3. When there is no email, a recent row on the same item (or slot) with
 *    the exact same name (case-insensitive) and quantity is reused inside a
 *    30-minute window. That covers the common timeout-then-resubmit case.
 *    Two different people who share a name can still both sign up after the
 *    window, or immediately if their names are not an exact match.
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

export function normalizeSignupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().toLowerCase();
  return name.length > 0 ? name : null;
}

export type SignupEmailRow = {
  session_id: string;
  member_email?: string | null;
  member_name?: string | null;
  signed_up_at: string;
};

function rowIsInWindow(signedUpAt: string, now: Date, windowMs: number): boolean {
  const at = new Date(signedUpAt).getTime();
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= 0 && age <= windowMs;
}

/**
 * Find a recent signup on this slot with the same email so a 503 retry does
 * not insert a second row. When there is no email, a recent exact name match
 * on the same slot is reused for the 30-minute window only.
 */
export function findReusableEmailSignup<T extends SignupEmailRow>(
  existing: T[],
  opts: {
    sessionId: string;
    memberEmail: unknown;
    memberName?: unknown;
    now?: Date;
    windowMs?: number;
  },
): T | null {
  const email = normalizeSignupEmail(opts.memberEmail);
  const name = normalizeSignupName(opts.memberName);
  const now = opts.now ?? new Date();
  const windowMs = opts.windowMs ?? SIGNUP_IDEMPOTENCY_WINDOW_MS;
  for (const row of existing) {
    if (row.session_id !== opts.sessionId) continue;
    if (!rowIsInWindow(row.signed_up_at, now, windowMs)) continue;
    if (email) {
      if (normalizeSignupEmail(row.member_email) !== email) continue;
      return row;
    }
    if (!name) continue;
    if (normalizeSignupEmail(row.member_email)) continue;
    if (normalizeSignupName(row.member_name) !== name) continue;
    return row;
  }
  return null;
}

export type ItemSignupEmailRow = {
  item_id?: string | null;
  custom_label?: string | null;
  member_email?: string | null;
  member_name?: string | null;
  quantity?: number | null;
  signed_up_at: string;
};

function itemSignupTargetMatches(
  row: ItemSignupEmailRow,
  itemId: string | null,
  customLabel: string | null,
): boolean {
  const rowItem = row.item_id || null;
  const rowLabel = (row.custom_label ?? "").trim() || null;
  if (itemId) return rowItem === itemId;
  if (customLabel) return rowLabel === customLabel;
  return false;
}

/**
 * Find a recent item signup so a retry does not insert a second row.
 * Email + item wins when an email is present. Name + item + quantity is
 * used only when both the request and the existing row have no email.
 */
export function findReusableEmailItemSignup<T extends ItemSignupEmailRow>(
  existing: T[],
  opts: {
    itemId?: string | null;
    customLabel?: string | null;
    memberEmail: unknown;
    memberName?: unknown;
    quantity?: number;
    now?: Date;
    windowMs?: number;
  },
): T | null {
  const email = normalizeSignupEmail(opts.memberEmail);
  const name = normalizeSignupName(opts.memberName);
  const now = opts.now ?? new Date();
  const windowMs = opts.windowMs ?? SIGNUP_IDEMPOTENCY_WINDOW_MS;
  const itemId = opts.itemId || null;
  const customLabel = (opts.customLabel ?? "").trim() || null;
  for (const row of existing) {
    if (!itemSignupTargetMatches(row, itemId, customLabel)) continue;
    if (!rowIsInWindow(row.signed_up_at, now, windowMs)) continue;
    if (email) {
      if (normalizeSignupEmail(row.member_email) !== email) continue;
      return row;
    }
    if (!name) continue;
    if (normalizeSignupEmail(row.member_email)) continue;
    if (normalizeSignupName(row.member_name) !== name) continue;
    if (opts.quantity != null && row.quantity != null && row.quantity !== opts.quantity) continue;
    return row;
  }
  return null;
}

/** Public list rows as shown on the event page (names may be blank when hidden). */
export type PublicItemSignupMatchRow = {
  item_id?: string | null;
  member_name?: string | null;
  signup_note?: string | null;
  quantity?: number | null;
};

/**
 * After a 5xx/timeout, the claim may already be on the public list even
 * though the client never got a 200. Names are only present when the
 * organizer shows signups publicly.
 */
export function findPublicItemSignupMatch(
  signups: PublicItemSignupMatchRow[],
  opts: { itemId: string; memberName: unknown; quantity?: number; signupNote?: unknown },
): PublicItemSignupMatchRow | null {
  const name = normalizeSignupName(opts.memberName);
  if (!name) return null;
  const note =
    typeof opts.signupNote === "string" && opts.signupNote.trim()
      ? opts.signupNote.trim()
      : null;
  for (const row of signups) {
    if ((row.item_id || null) !== opts.itemId) continue;
    if (normalizeSignupName(row.member_name) !== name) continue;
    if (opts.quantity != null && row.quantity != null && row.quantity !== opts.quantity) continue;
    if (note) {
      const rowNote = (row.signup_note ?? "").trim() || null;
      if (rowNote && rowNote !== note) continue;
    }
    return row;
  }
  return null;
}


/** Refetch-and-recover only after a server or network failure, never a 4xx. */
export function isSignupRecoveryStatus(status: number): boolean {
  return status >= 500;
}

export function itemSignupIdempotencyStorageKey(eventId: string, itemId: string): string {
  return `ws-item-idempotency:${eventId}:${itemId}`;
}

export function customItemSignupIdempotencyStorageKey(eventId: string): string {
  return `ws-item-idempotency:${eventId}:custom`;
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function readStoredSignupIdempotencyKey(storageKey: string): string | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    return parseSignupIdempotencyKey(storage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function storeSignupIdempotencyKey(storageKey: string, key: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(storageKey, key);
  } catch {
    // Quota or private mode: automatic retries still share the in-memory key.
  }
}

export function clearStoredSignupIdempotencyKey(storageKey: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

export function getOrCreateStoredSignupIdempotencyKey(storageKey: string): string {
  const existing = readStoredSignupIdempotencyKey(storageKey);
  if (existing) return existing;
  const key = newSignupIdempotencyKey();
  storeSignupIdempotencyKey(storageKey, key);
  return key;
}

export interface IdempotencyStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const memory = new Map<string, { value: unknown; expiresAt: number }>();

export function clearSignupIdempotencyMemory(): void {
  memory.clear();
}

export function signupIdempotencyMemorySize(): number {
  return memory.size;
}

function pruneExpiredMemory(nowMs: number): void {
  for (const [k, hit] of memory) {
    if (hit.expiresAt < nowMs) memory.delete(k);
  }
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
      const nowMs = now();
      pruneExpiredMemory(nowMs);
      memory.set(key, { value, expiresAt: nowMs + ttlMs });
    },
  };
}

/**
 * If `key` was already completed in `store`, return that value and skip
 * `produce`. Otherwise run it once and remember the result.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function withIdempotency<T>(
  key: string | null,
  store: IdempotencyStore,
  produce: () => Promise<T>,
): Promise<{ value: T; reused: boolean }> {
  if (!key) return { value: await produce(), reused: false };
  const pending = inflight.get(key);
  if (pending) return { value: (await pending) as T, reused: true };
  const existing = await store.get(key);
  if (existing !== undefined) return { value: existing as T, reused: true };
  const pendingAfterGet = inflight.get(key);
  if (pendingAfterGet) return { value: (await pendingAfterGet) as T, reused: true };
  const run = (async () => {
    const value = await produce();
    await store.set(key, value);
    return value;
  })();
  inflight.set(key, run);
  try {
    return { value: await run, reused: false };
  } finally {
    inflight.delete(key);
  }
}
