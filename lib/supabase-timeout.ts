/**
 * Bounds a Supabase call so a stalled database can't hold a serverless
 * function until the platform's hard limit (we saw 300s 504s on Oct 19).
 */

export const SUPABASE_TIMEOUT_MS = 10_000;

export class SupabaseTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Supabase call timed out after ${ms}ms: ${label}`);
    this.name = "SupabaseTimeoutError";
  }
}

/** Resolves with the call's result, or rejects with SupabaseTimeoutError after `ms`. */
export function withSupabaseTimeout<T>(
  call: PromiseLike<T>,
  label: string,
  ms: number = SUPABASE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SupabaseTimeoutError(label, ms)), ms);
  });
  return Promise.race([Promise.resolve(call), timeout]).finally(() => clearTimeout(timer));
}
