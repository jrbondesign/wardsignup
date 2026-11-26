/**
 * Keeps sign in and link secrets out of PostHog.
 *
 * Magic links land on /auth/callback?token_hash=...&type=..., PKCE and OAuth
 * land with ?code=..., implicit grants carry #access_token=...&refresh_token=...
 * and org invites pass ?token=... (also nested, URL encoded, inside ?next=).
 * The callback page strips these from the address bar once it finishes, but
 * the first pageview, autocapture, web vitals, person "initial URL" props and
 * session replay (page href and network requests) can see them before that.
 *
 * Cancel, signup success, feedback and build-next links carry the token in
 * the path (/cancel/<token>, /signup-success/<token>, /feedback/<token>,
 * /build-next/<token>). The same is true of /api/signups/calendar/<token>,
 * /api/feedback/<token> and /api/build-next/<token> when those requests are
 * recorded in session replay. A cancel token can still be live, so these
 * matter more than a spent sign in token.
 *
 * Only the secret values are replaced; the route, the parameter names, other
 * query params and the rest of the URL stay as they were so pageview
 * analytics still work. Path tokens become [redacted]. Everything here is
 * best effort and never throws.
 */

/** Query or hash parameters whose values are secrets on auth URLs. */
export const AUTH_URL_PARAMS = [
  "token_hash",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "id_token",
  "token",
  "code",
] as const;

/**
 * Routes that put a secret in the next path segment. First-segment names must
 * not also match a later segment of another route (for example
 * /api/signups/cancel/lookup is left alone).
 */
export const TOKEN_PATH_PREFIXES = [
  "signup-success",
  "cancel",
  "feedback",
  "build-next",
  "api/signups/calendar",
  "api/feedback",
  "api/build-next",
] as const;

export const REDACTED_VALUE = "[redacted]";

// A parameter starts after ? & # or ; (raw, URL encoded or double encoded,
// as in ?next=%2Forgs%2Faccept%3Ftoken%3D...). Its value runs to the next
// separator. `error_code`, `token_type` and `zipcode` are left alone because
// the name must start right after a separator and end at "=".
const SEP = String.raw`(?:[?&#;]|%(?:25)?(?:3F|26|23|3B))`;
const EQ = String.raw`(?:=|%(?:25)?3D)`;
const END = String.raw`(?=$|[&#;\s"'<>]|%(?:25)?(?:26|23|3B))`;
const NAMES = [...AUTH_URL_PARAMS].sort((a, b) => b.length - a.length).join("|");
const AUTH_PARAM_PATTERN = new RegExp(`(${SEP}(?:${NAMES})${EQ})([^&#;\\s"'<>]+?)${END}`, "gi");

const SLASH = String.raw`(?:/|%(?:25)?2F)`;
const PATH_END = String.raw`(?=$|[/?#;&\s"'<>]|%(?:25)?(?:2F|3F|23|3B|26))`;
const PATH_ALREADY_REDACTED = String.raw`\[(?:redacted|token)\]`;
// Longest first so api/signups/calendar wins over a shorter prefix.
const PATH_ALT = [...TOKEN_PATH_PREFIXES]
  .sort((a, b) => b.length - a.length)
  .map((p) => p.split("/").map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(SLASH))
  .join("|");
// Lead anchors the match at the start of a path (or after a host / a
// separator such as = or "). A letter before /cancel/ is ignored, so
// /api/signups/cancel/lookup is not treated as a cancel page token.
const PATH_LEAD = String.raw`(?:^|://[^/?#]*|[^A-Za-z0-9._~%/-])`;
const TOKEN_PATH_PATTERN = new RegExp(
  `(${PATH_LEAD}${SLASH}(?:${PATH_ALT})${SLASH})(?!${PATH_ALREADY_REDACTED})([^/?#;&\\s"'<>]+?)${PATH_END}`,
  "gi",
);

// Query params use "token" or "code"; path routes use the names above.
const QUICK_CHECK = /token|code|cancel|signup-success|feedback|build-next|calendar/i;

/** Object keys whose string values are secrets (not "code", which is too generic). */
const SECRET_PROP_KEYS = new Set<string>([
  "token_hash",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "id_token",
  "token",
]);

function scrubTokenPaths(input: string): string {
  return input.replace(TOKEN_PATH_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED_VALUE}`);
}

/** Replace auth param values and token path segments in a URL or text. */
export function scrubAuthParams(input: string): string {
  if (typeof input !== "string" || input.length === 0 || !QUICK_CHECK.test(input)) return input;
  try {
    let out = input.replace(AUTH_PARAM_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED_VALUE}`);
    try {
      out = scrubTokenPaths(out);
    } catch {
      // keep the query-param scrub if the path pass throws
    }
    return out;
  } catch {
    return input;
  }
}

const MAX_DEPTH = 8;

/** Apply scrubAuthParams to every string (values and keys) inside a JSON like value. Returns a copy. */
export function scrubAuthParamsDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubAuthParams(value) as T;
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => scrubAuthParamsDeep(v, depth + 1)) as T;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  // Keys too: $$heatmap events key their data by page URL.
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const secretKey = SECRET_PROP_KEYS.has(k.toLowerCase()) && typeof v === "string" && v.length > 0;
    out[scrubAuthParams(k)] = secretKey ? REDACTED_VALUE : scrubAuthParamsDeep(v, depth + 1);
  }
  return out as T;
}

type AnalyticsEvent = {
  event?: string;
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
};

/** Replay snapshots: scrub only the page href on meta and custom events, not the whole DOM. */
function scrubSnapshotData(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((item) => {
    const inner = item && typeof item === "object" ? (item as { data?: unknown }).data : undefined;
    if (!inner || typeof inner !== "object" || typeof (inner as { href?: unknown }).href !== "string") return item;
    return { ...item, data: { ...inner, href: scrubAuthParams((inner as { href: string }).href) } };
  });
}

/**
 * posthog-js before_send hook: removes auth param values from every string on
 * the event ($current_url, $referrer, $session_entry_url, $elements_chain,
 * $set_once $initial_current_url, ...) and rewrites token path segments.
 * Never throws and never drops an event.
 */
export function scrubAuthParamsFromEvent<E extends AnalyticsEvent | null>(event: E): E {
  if (!event) return event;
  try {
    const out: AnalyticsEvent = { ...event };
    if (event.properties) {
      if (event.event === "$snapshot") {
        const { $snapshot_data, ...rest } = event.properties;
        out.properties = { ...scrubAuthParamsDeep(rest), $snapshot_data: scrubSnapshotData($snapshot_data) };
      } else {
        out.properties = scrubAuthParamsDeep(event.properties);
      }
      // posthog-js sets properties.token to the project API key (public, phc_...)
      // right before this hook and sends it as the batch api_key. Redacting it
      // makes PostHog drop the event, so it is always kept as is.
      if (typeof event.properties.token === "string") {
        out.properties = { ...out.properties, token: event.properties.token };
      }
    }
    if (event.$set) out.$set = scrubAuthParamsDeep(event.$set);
    if (event.$set_once) out.$set_once = scrubAuthParamsDeep(event.$set_once);
    return out as E;
  } catch {
    return event;
  }
}

/** Same body deny list posthog-js applies when no mask function is set. */
const BODY_DENY_LIST = [
  "password",
  "secret",
  "passwd",
  "api_key",
  "apikey",
  "auth",
  "credentials",
  "mysql_pwd",
  "privatekey",
  "private_key",
  "token",
];

function scrubBody(body: unknown, label: string): unknown {
  if (typeof body !== "string" || body.length === 0) return body;
  // Card numbers and SSNs, as the SDK's own check does for whole values.
  const compact = body.trim().replace(/[- ]/g, "");
  if (/^\d{13,19}$/.test(compact) || /^\d{3}-?\d{2}-?\d{4}$/.test(body.trim())) {
    return `[SessionRecording] ${label} body redacted`;
  }
  const hit = BODY_DENY_LIST.find((word) => body.indexOf(word) !== -1);
  if (hit) return `[SessionRecording] ${label} body redacted as might contain: ${hit}`;
  return scrubAuthParams(body);
}

type NetworkRequestLike = {
  name?: string;
  url?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  [key: string]: unknown;
};

/**
 * session_recording.maskCapturedNetworkRequestFn: scrubs auth params from the
 * request URL. posthog-js also routes the replay page href through this hook
 * (as `{ name: href }`). Setting the hook turns off the SDK's own body deny
 * list, so the same check runs here.
 */
export function maskReplayNetworkRequest<R extends NetworkRequestLike>(request: R): R {
  try {
    const out: NetworkRequestLike = { ...request };
    if (typeof out.name === "string") out.name = scrubAuthParams(out.name);
    if (typeof out.url === "string") out.url = scrubAuthParams(out.url);
    if ("requestBody" in out) out.requestBody = scrubBody(out.requestBody, "Request");
    if ("responseBody" in out) out.responseBody = scrubBody(out.responseBody, "Response");
    return out as R;
  } catch {
    // Fail closed: drop the URL rather than risk sending a token.
    return { ...request, name: "", url: undefined, requestBody: undefined, responseBody: undefined };
  }
}
