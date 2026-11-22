import { captureServerException } from "@/lib/posthog-server";

/** Cancel tokens are Postgres uuids (signups.cancel_token, gen_random_uuid()). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWellFormedCancelToken(token: string): boolean {
  return UUID_RE.test(token);
}

/**
 * Error reported to PostHog when a cancel link lookup fails in the database.
 * Supabase returns a plain PostgrestError object (not thrown), and its message
 * echoes the token for 22P02 ("invalid input syntax for type uuid: ..."), so
 * we report our own error with only the Postgres code.
 */
export class CancelLookupError extends Error {
  constructor(code: string | null) {
    super(`Cancel link lookup failed (${code ?? "unknown"})`);
    this.name = "CancelLookupError";
  }
}

/**
 * Report a failed cancel link lookup to PostHog error tracking. Never sends
 * the token or the database message; only the route, the Postgres code and
 * whether the token was a well formed uuid. Never throws.
 */
export function captureCancelLookupError(dbError: unknown, route: string, token: string): void {
  const rawCode = (dbError as { code?: unknown } | null)?.code;
  const code = typeof rawCode === "string" && rawCode ? rawCode : null;
  captureServerException(new CancelLookupError(code), {
    route,
    properties: {
      kind: "cancel_lookup_db_error",
      error_code: code,
      token_malformed: !isWellFormedCancelToken(token),
    },
  });
}
