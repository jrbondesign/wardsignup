/**
 * Retry a request when the server is briefly unavailable (503) or the
 * network fails. `makeRequest` runs on every attempt so the caller can mint
 * a fresh captcha token while keeping the same idempotency key.
 *
 * Only 503 is retried. 4xx and other 5xx responses are returned as is.
 */

export const DEFAULT_503_RETRY_DELAYS_MS = [500, 2000] as const;

export type FetchRetryOn503Options = {
  /** Delay before each retry. Length is the number of retries (default two). */
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableSignupFailure(res: Response): boolean {
  return res.status === 503;
}

export async function fetchRetryOn503(
  makeRequest: () => Promise<Response>,
  opts: FetchRetryOn503Options = {},
): Promise<Response> {
  const delays = opts.delaysMs ?? DEFAULT_503_RETRY_DELAYS_MS;
  const sleep = opts.sleep ?? defaultSleep;
  let last: Response | undefined;
  const attempts = delays.length + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      last = await makeRequest();
      if (!isRetryableSignupFailure(last) || i === attempts - 1) return last;
    } catch (err) {
      if (i === attempts - 1) throw err;
      // Retry network failures only. Application errors (validation, captcha)
      // should surface immediately.
      const name = err instanceof Error ? err.name : "";
      if (name !== "TypeError" && name !== "DOMException") throw err;
    }
    await sleep(delays[i]!);
  }
  return last as Response;
}
