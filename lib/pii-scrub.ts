/**
 * Redacts personal data and secrets from free text before it leaves the app
 * for analytics or error tracking (PostHog $exception events).
 *
 * Errors from signup, magic link and email paths can echo an address, a
 * Postgres unique violation prints `Key (col)=(value)`, and provider errors can
 * include tokens. Everything here is best effort and never throws.
 */

type Rule = { pattern: RegExp; replace: string | ((match: string, ...groups: string[]) => string) };

const RULES: Rule[] = [
  // Postgres constraint detail: Key (email, event_id)=(a@b.co, 123). Keep the
  // column names, drop the values.
  { pattern: /Key \(([^()]*)\)=\((?:[^()]|\([^()]*\))*\)/g, replace: (_m, cols: string) => `Key (${cols})=([redacted])` },
  // JWTs (Supabase access tokens, signed links).
  { pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, replace: "[jwt]" },
  // Authorization header values.
  { pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replace: (_m, kind: string) => `${kind} [token]` },
  // Provider keys with well known prefixes (Resend, Stripe, GitHub, Supabase, Slack).
  {
    pattern: /\b(?:re|sk|rk|pk_live|sk_live|sk_test|ghp|gho|ghs|ghu|github_pat|sb_secret|sbp|xox[abprs])_[A-Za-z0-9_-]{16,}/g,
    replace: "[secret]",
  },
  // Sensitive query string parameters. Requires ? & or ; before the name so
  // prose like "status code=500" keeps its value.
  {
    pattern: /([?&;](?:access_token|refresh_token|id_token|token|api_key|apikey|key|secret|password|code|signature|sig)=)[^&\s"'#]+/gi,
    replace: (_m, prefix: string) => `${prefix}[redacted]`,
  },
  // Email addresses, plain and URL encoded.
  // The lookbehind anchors the match at the start of a run, so a long run with
  // no @ is scanned once instead of once per character (no quadratic blowup).
  { pattern: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gi, replace: "[email]" },
  // Phone numbers with separators (US style), so stack line:col pairs are left alone.
  { pattern: /(?<![\w.:])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w])/g, replace: "[phone]" },
  // E.164 numbers (+15551234567). Bare digit runs are left alone: they are
  // usually ids, counts or timestamps.
  { pattern: /(?<![\w+])\+\d{10,15}(?!\d)/g, replace: "[phone]" },
  // Long hex strings (API keys, hashes of secrets). UUIDs have dashes and are kept.
  { pattern: /\b[a-f0-9]{32,}\b/gi, replace: "[hex]" },
  // Long base64 or base64url runs that look random (upper, lower and digits).
  {
    pattern: /[A-Za-z0-9+_-]{40,}={0,2}/g,
    replace: (m: string) => (/[A-Z]/.test(m) && /[a-z]/.test(m) && /\d/.test(m) ? "[secret]" : m),
  },
];

/**
 * Longest string scrubbed. Longer input is cut first so a huge message or a
 * minified one line stack can't stall an error handler; the tail is dropped
 * rather than sent unscrubbed.
 */
export const MAX_SCRUB_LENGTH = 20_000;

/** Redact emails, phone numbers, tokens and secrets from a string. */
export function scrubText(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;
  let out = input.length > MAX_SCRUB_LENGTH ? `${input.slice(0, MAX_SCRUB_LENGTH)}…[truncated]` : input;
  for (const rule of RULES) {
    try {
      out = out.replace(rule.pattern, rule.replace as never);
    } catch {
      // keep going with the other rules
    }
  }
  return out;
}

/** Scrub every string value in a flat property bag. Non strings pass through. */
export function scrubProperties<T extends Record<string, unknown>>(props: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = typeof v === "string" ? scrubText(v) : v;
  }
  return out as T;
}

const MAX_CAUSE_DEPTH = 3;

/**
 * Return a new Error whose name, message, stack and cause chain are scrubbed.
 * Non Error values (strings, Supabase/PostgREST error objects) become an Error
 * built from their scrubbed message. The original value is never mutated.
 */
export function scrubError(value: unknown, depth = 0): Error {
  if (value instanceof Error) {
    const copy = new Error(scrubText(value.message));
    copy.name = scrubText(value.name);
    copy.stack = typeof value.stack === "string" ? scrubText(value.stack) : undefined;
    const cause = (value as { cause?: unknown }).cause;
    if (cause !== undefined && depth < MAX_CAUSE_DEPTH) {
      (copy as { cause?: unknown }).cause = scrubError(cause, depth + 1);
    }
    return copy;
  }
  if (typeof value === "string") return new Error(scrubText(value));
  if (value && typeof value === "object") {
    const obj = value as { message?: unknown; name?: unknown; code?: unknown };
    let message: string;
    if (typeof obj.message === "string") {
      message = obj.message;
    } else {
      try {
        message = JSON.stringify(value).slice(0, 1000);
      } catch {
        message = "Non Error exception";
      }
    }
    const copy = new Error(scrubText(message));
    if (typeof obj.name === "string" && obj.name) copy.name = scrubText(obj.name);
    else if (typeof obj.code === "string" && obj.code) copy.name = `Error ${scrubText(obj.code)}`;
    return copy;
  }
  return new Error(scrubText(String(value)));
}

const MAX_DEEP_DEPTH = 8;

/** Scrub every string inside a JSON like value (arrays and plain objects). */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (value === null || typeof value !== "object") return value;
  // Fail closed: anything nested deeper than we scrub is replaced, not sent.
  if (depth >= MAX_DEEP_DEPTH) return "[truncated]" as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v, depth + 1);
  return out as T;
}

/** Page URL properties that can carry ?email= or ?token= on an exception. */
const URL_KEYS = new Set(["$current_url", "$pathname", "$referrer", "$initial_referrer"]);

/**
 * posthog-js before_send hook: scrubs browser $exception events (message,
 * type, stack frames and page URLs) the same way server exceptions are scrubbed. Other
 * events pass through untouched. Never throws and never drops an event.
 */
export function scrubExceptionEvent<E extends { event?: string; properties?: Record<string, unknown> } | null>(event: E): E {
  try {
    if (!event || event.event !== "$exception" || !event.properties) return event;
    const properties: Record<string, unknown> = { ...event.properties };
    for (const key of Object.keys(properties)) {
      if (key.startsWith("$exception") || URL_KEYS.has(key)) properties[key] = scrubDeep(properties[key]);
    }
    return { ...event, properties };
  } catch {
    return event;
  }
}
