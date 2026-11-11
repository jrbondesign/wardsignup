/**
 * Bounds a Supabase call so a stalled database can't hold a serverless
 * function until the platform's hard limit (we saw 300s 504s on Oct 19).
 *
 * When the call is a function, it receives an AbortSignal that is aborted
 * when the limit is reached so PostgREST can drop the query instead of
 * leaving it running after we have already returned 503.
 */

export const SUPABASE_TIMEOUT_MS = 10_000;

export const SIGNUP_TIMEOUT_MESSAGE =
  "Signups are taking longer than usual. Please try again in a moment.";

/** For reads after a signup already saved (confirmation or cancel lookup). */
export const REQUEST_TIMEOUT_MESSAGE =
  "This is taking longer than usual. Please try again in a moment.";

export class SupabaseTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Supabase call timed out after ${ms}ms: ${label}`);
    this.name = "SupabaseTimeoutError";
  }
}

export type SupabaseTimeoutCall<T> =
  | PromiseLike<T>
  | ((signal: AbortSignal) => PromiseLike<T>);

/** Resolves with the call's result, or rejects with SupabaseTimeoutError after `ms`. */
export function withSupabaseTimeout<T>(
  call: SupabaseTimeoutCall<T>,
  label: string,
  ms: number = SUPABASE_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const work =
    typeof call === "function" ? Promise.resolve(call(controller.signal)) : Promise.resolve(call);
  // If the timer wins, `work` may still reject (for example after abort).
  // This handler keeps that from becoming an unhandledRejection.
  work.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject the race first so an abort error from `work` cannot win.
      reject(new SupabaseTimeoutError(label, ms));
      controller.abort();
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
