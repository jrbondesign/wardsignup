/**
 * Cloudflare Turnstile on the sign in / sign up link form and on the public
 * event signup forms (/api/signups, /api/signups/bulk, /api/item-signups).
 *
 * Off (a no-op) until BOTH NEXT_PUBLIC_TURNSTILE_SITE_KEY and
 * TURNSTILE_SECRET_KEY are set. Requiring both means setting only the secret
 * can't lock everyone out: without the site key the widget never renders and
 * no token would ever arrive.
 *
 * Supabase Auth's own captcha setting does not cover this flow. Accounts are
 * created by auth.admin.generateLink with the service role in
 * /api/auth/send-magic-link, which Supabase never captcha checks, so the token
 * is verified here, server side, before a link (and an account) is made.
 *
 * Siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

type Env = Record<string, string | undefined>;

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Public site key for the widget, or null when Turnstile is off. */
export function turnstileSiteKey(env: Env = process.env): string | null {
  return env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

/** Server side: the secret, only when Turnstile is fully configured. */
export function turnstileSecret(env: Env = process.env): string | null {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !turnstileSiteKey(env)) return null;
  return secret;
}

/**
 * Siteverify error codes that are not about the visitor's token: Cloudflare's
 * internal error, or our own secret being wrong or missing. These fail open.
 * Token codes (invalid-input-response, timeout-or-duplicate,
 * missing-input-response, bad-request) still refuse.
 */
const SITEVERIFY_NOT_VISITOR_CODES: ReadonlySet<string> = new Set([
  "internal-error",
  "invalid-input-secret",
  "missing-input-secret",
]);

export type TurnstileResult =
  | { ok: true; skipped?: "not_configured" | "siteverify_unavailable" }
  | { ok: false; reason: "missing_token" | "invalid_token"; codes?: string[] };

/**
 * Verifies a widget token. A missing or rejected token fails. If Cloudflare's
 * siteverify itself is down (network error, timeout, 5xx, 429, an answer that
 * isn't siteverify JSON, internal-error) or our secret is rejected, we let the
 * request through and log it: BotID and the IP / per recipient rate limits still
 * apply, and an outage at Cloudflare shouldn't stop people signing in.
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | null,
  opts: { env?: Env; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<TurnstileResult> {
  const secret = turnstileSecret(opts.env ?? process.env);
  if (!secret) return { ok: true, skipped: "not_configured" };
  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    return { ok: false, reason: "missing_token" };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp && remoteIp !== "unknown" ? { remoteip: remoteIp } : {}),
      }),
      signal: controller.signal,
    });
    // 5xx or 429: Cloudflare can't answer right now. Fail open.
    if (res.status >= 500 || res.status === 429) {
      console.error(`turnstile siteverify ${res.status}; allowing (BotID and rate limits still apply)`);
      return { ok: true, skipped: "siteverify_unavailable" };
    }
    const json = (await res.json().catch(() => null)) as { success?: unknown; "error-codes"?: unknown } | null;
    // Not a siteverify answer at all (HTML block page, empty body): treat as
    // an outage, not as a verdict on the visitor's token.
    if (!json || typeof json.success !== "boolean") {
      console.error(`turnstile siteverify unreadable answer (${res.status}); allowing (BotID and rate limits still apply)`);
      return { ok: true, skipped: "siteverify_unavailable" };
    }
    if (json.success === true) return { ok: true };
    const codes = Array.isArray(json["error-codes"])
      ? (json["error-codes"] as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    // Cloudflare's own failure, or OUR secret is wrong or missing. Neither is
    // the visitor's fault, and refusing would block every signup and sign in
    // until someone noticed. Allow and log loudly so the logs show it.
    const outage = codes.find((c) => SITEVERIFY_NOT_VISITOR_CODES.has(c));
    if (outage) {
      console.error(`turnstile siteverify ${outage}; allowing (BotID and rate limits still apply). Check TURNSTILE_SECRET_KEY.`);
      return { ok: true, skipped: "siteverify_unavailable" };
    }
    return { ok: false, reason: "invalid_token", codes };
  } catch (e) {
    console.error("turnstile siteverify unreachable; allowing (BotID and rate limits still apply):", e);
    return { ok: true, skipped: "siteverify_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/** What the browser shows when verifyTurnstile says no. No dashes: customer copy. */
export function turnstileRejectionMessage(reason: "missing_token" | "invalid_token"): string {
  return reason === "missing_token"
    ? "Please wait for the quick security check to finish, then try again."
    : "The security check expired or failed. Please try again.";
}
