/**
 * Server-side PostHog feature flags, targeted per ward (organization).
 *
 * FAIL CLOSED. A flag can only ever turn a feature ON for an org on top of the
 * existing env allowlist; it can never turn the allowlist off. Any PostHog
 * problem (no key, network error, timeout, unexpected value) evaluates to
 * false, so the result falls back to the allowlist alone.
 *
 * Targeting without paid group analytics: flags are evaluated for a synthetic
 * distinct id `org:<uuid>` with the person property `org_id` supplied inline,
 * so a release condition "org_id is one of [...]" works on the free tier.
 * $feature_flag_called events are not sent, so no synthetic persons are created.
 */
import { PostHog } from "posthog-node";

/** Flag keys. Create these in PostHog (boolean flags). */
export const FLAG_GCAL_SYNC = "gcal-sync-beta";
export const FLAG_COVER_IMAGES = "event-cover-images";

export const ORG_FLAG_KEYS = [FLAG_GCAL_SYNC, FLAG_COVER_IMAGES] as const;
export type OrgFlagKey = (typeof ORG_FLAG_KEYS)[number];

/** Default per-evaluation budget; a slow PostHog must not slow the page. */
export const FLAG_TIMEOUT_MS = 1500;
/** Cache successful evaluations briefly so one page load costs one request per flag. */
export const FLAG_CACHE_TTL_MS = 60_000;

export interface FlagClient {
  isFeatureEnabled(
    key: string,
    distinctId: string,
    options?: {
      personProperties?: Record<string, string>;
      sendFeatureFlagEvents?: boolean;
      disableGeoip?: boolean;
    },
  ): Promise<boolean | undefined>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let flagClient: PostHog | null = null;
function defaultFlagClient(): FlagClient | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  if (!flagClient) {
    flagClient = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
      featureFlagsRequestTimeoutMs: FLAG_TIMEOUT_MS,
    });
  }
  return flagClient;
}

const cache = new Map<string, { value: boolean; expires: number }>();

/** Test hook. */
export function __resetOrgFlagCacheForTests(): void {
  cache.clear();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Is `flagKey` on for this org in PostHog? Never throws; false on any doubt.
 * Only a literal `true` counts as on.
 */
export async function isOrgFlagEnabled(
  flagKey: OrgFlagKey,
  orgId: string | null | undefined,
  opts: { client?: FlagClient | null; timeoutMs?: number; now?: () => number } = {},
): Promise<boolean> {
  if (!orgId || !UUID_RE.test(orgId)) return false;
  if (process.env.POSTHOG_FLAGS_DISABLED === "1") return false;
  const now = opts.now ?? Date.now;
  const cacheKey = `${flagKey}:${orgId}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now()) return hit.value;

  let client: FlagClient | null;
  try {
    client = opts.client !== undefined ? opts.client : defaultFlagClient();
  } catch {
    return false;
  }
  if (!client) return false;

  try {
    const result = await withTimeout(
      Promise.resolve(
        client.isFeatureEnabled(flagKey, `org:${orgId}`, {
          personProperties: { org_id: orgId },
          sendFeatureFlagEvents: false,
          disableGeoip: true,
        }),
      ),
      opts.timeoutMs ?? FLAG_TIMEOUT_MS,
    );
    if (result === "timeout") return false; // not cached: retry next request
    const value = result === true;
    cache.set(cacheKey, { value, expires: now() + FLAG_CACHE_TTL_MS });
    return value;
  } catch (e) {
    console.error(`PostHog flag ${flagKey} evaluation failed (falling back to allowlist):`, e);
    return false;
  }
}

/**
 * The shared gate: allowlisted OR flag on. The flag is only consulted when the
 * allowlist says no, so allowlisted orgs never wait on PostHog.
 */
export async function allowlistOrFlag(
  allowlisted: boolean,
  flagKey: OrgFlagKey,
  orgId: string | null | undefined,
  opts?: Parameters<typeof isOrgFlagEnabled>[2],
): Promise<boolean> {
  if (allowlisted) return true;
  return isOrgFlagEnabled(flagKey, orgId, opts);
}
