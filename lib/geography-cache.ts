import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { isRealOrgId, TEST_ORG_IDS, TEST_OWNER_EMAILS } from "@/lib/test-orgs";
import {
  GEOGRAPHY_HOGQL,
  GEOGRAPHY_SNAPSHOT,
  toGeographyResponse,
  type GeographyCity,
} from "@/lib/geography-snapshot";

/** Daily cadence: cron refreshes once per Phoenix day (8 AM Arizona). */
export const GEOGRAPHY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Public homepage and founder metrics map endpoint. */
export const GEOGRAPHY_PUBLIC_PATH = "/api/geography/public";
/**
 * CDN header for the public map endpoint: fresh for 6h, then served stale for
 * up to 7 days while the CDN refreshes in the background. The map is a daily
 * aggregate (cron at 8 AM Arizona), so it does not need to be real time; a
 * longer window means the homepage almost never reaches Postgres. After a
 * cron write we revalidate the Next.js path only when a confirming read of
 * the new row succeeds. We do not purge the CDN tag: a hard purge leaves
 * the edge empty, and the next homepage view then hits the database. If that
 * read times out, a cacheable fallback would pin a stale count. Existing
 * good responses stay until they expire, at most 6h late.
 */
export const GEOGRAPHY_PUBLIC_CACHE_CONTROL =
  "public, s-maxage=21600, stale-while-revalidate=604800";

/**
 * CDN header when the route had to serve the baked snapshot (cache row read
 * slow, failed or empty, and no in-memory last-good payload). Not cacheable,
 * so the CDN keeps or re-fetches the last good copy instead of pinning the
 * fallback. A short s-maxage would still overwrite a good edge entry.
 */
export const GEOGRAPHY_FALLBACK_CACHE_CONTROL = "private, no-store";

/** Vercel CDN cache tag on good public map responses. The cron writer no longer hard-purges it. */
export const GEOGRAPHY_CDN_TAG = "geography-public";

/**
 * Give up on a slow geography_snapshot_cache read. Past this, the public
 * route serves the in-memory last-good payload if this instance has one,
 * otherwise the baked snapshot, instead of waiting for the platform to kill
 * the function.
 */
export const GEOGRAPHY_CACHE_READ_TIMEOUT_MS = 5_000;

/**
 * Headers that actually cache (or refuse to cache) a force-dynamic geography
 * response at Vercel CDN. Cache-Control alone is rewritten to "public" on
 * this kind of route, which would drop s-maxage and also drop no-store on a
 * fallback. CDN-Cache-Control and Vercel-CDN-Cache-Control are what the edge
 * honors. Open PR #160 adds the same helper; if both land, keep one copy.
 */
export function geographyCacheHeaders(
  cacheControl: string,
  tag?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Vercel-CDN-Cache-Control": cacheControl,
  };
  if (tag) headers["Vercel-Cache-Tag"] = tag;
  return headers;
}

/**
 * Refresh the Next.js cache for the public map after a confirmed snapshot
 * write. Does not purge the Vercel-Cache-Tag: dropping the CDN copy is what
 * sent the first post-refresh homepage views to Postgres, and a timed-out
 * fallback then got cached. The 6h s-maxage plus stale-while-revalidate
 * window already covers a missed path revalidation. Never throws: a failed
 * revalidate must not fail the write.
 */
export function revalidatePublicGeography(): boolean {
  try {
    revalidatePath(GEOGRAPHY_PUBLIC_PATH);
    return true;
  } catch (err) {
    console.warn("geography public revalidate failed:", err);
    return false;
  }
}

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/$/, "") ||
  "https://us.i.posthog.com";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || "370646";
const CACHE_ROW_ID = "default";

export type GeographySource = "cache" | "live" | "snapshot";

export type GeographyPayload = ReturnType<typeof toGeographyResponse> & {
  refreshedAt?: string;
};

/**
 * Last successfully read (or written) cache payload on this server instance.
 * Used when a later geography_snapshot_cache read times out or fails, so the
 * route can keep serving the last good counts instead of the baked snapshot.
 * Per instance only: a cold instance still falls through to the snapshot.
 */
let lastGoodGeography: GeographyPayload | null = null;

export function getLastGoodGeography(): GeographyPayload | null {
  return lastGoodGeography;
}

export function rememberLastGoodGeography(payload: GeographyPayload): void {
  if (payload.source === "cache" && payload.cities.length > 0) {
    lastGoodGeography = payload;
  }
}

/** Test-only. */
export function clearLastGoodGeography(): void {
  lastGoodGeography = null;
}

function hasServiceRole(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
        process.env.SUPABASE_URL?.trim()),
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Event ids that belong to test wards (same definition as lib/test-orgs:
 * founder/team accounts or a listed test org id). Their activity is left out
 * of the map so the public count only reflects real wards.
 */
export async function getTestCampaignIds(): Promise<string[]> {
  if (!hasServiceRole()) return [];
  try {
    const admin = createServiceRoleClient();
    const emails = [...TEST_OWNER_EMAILS];
    const orgIds = [...TEST_ORG_IDS];
    const filters = [`user_email.in.(${emails.join(",")})`];
    if (orgIds.length) filters.push(`organization_id.in.(${orgIds.join(",")})`);
    const { data, error } = await admin
      .from("campaigns" as never)
      .select("id, organization_id")
      .or(filters.join(","));
    if (error) {
      console.warn("geography test campaigns:", error.message);
      return [];
    }
    return ((data ?? []) as { id: string; organization_id: string | null }[])
      .filter((r) => !isRealOrgId(r.organization_id))
      .map((r) => String(r.id))
      .filter((id) => UUID_RE.test(id));
  } catch (err) {
    console.warn("geography test campaigns failed:", err);
    return [];
  }
}

export function buildGeographyQuery(excludeCampaignIds: string[]): string {
  const ids = excludeCampaignIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return GEOGRAPHY_HOGQL;
  const list = ids.map((id) => `'${id}'`).join(", ");
  return GEOGRAPHY_HOGQL.replace(
    "AND properties.$geoip_city_name IS NOT NULL",
    `AND coalesce(toString(properties.campaign_id), toString(properties.event_id), '') NOT IN (${list})
    AND properties.$geoip_city_name IS NOT NULL`,
  );
}

/**
 * Live PostHog pull. Cron only. Display routes must never call this: a live
 * refresh on one request while the other still serves the CDN/DB row is how
 * the homepage and founder maps drift apart.
 */
export async function fetchLiveGeographyFromPostHog(): Promise<GeographyCity[] | null> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  if (!apiKey) return null;
  const query = buildGeographyQuery(await getTestCampaignIds());

  const response = await fetch(
    `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
        },
      }),
      // Always fetch fresh. A Next data cache entry here could make the cron
      // write a day old PostHog result into the shared snapshot row.
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(
      "PostHog geography query failed:",
      response.status,
      text.slice(0, 500),
    );
    return null;
  }

  const data = await response.json();
  return (data.results || []).map((row: (string | number)[]) => ({
    city: String(row[0] || ""),
    country: String(row[1] || ""),
    latitude: Number(row[2]) || 0,
    longitude: Number(row[3]) || 0,
    userCount: Number(row[4]) || 0,
  }));
}

export async function readGeographyCache(): Promise<{
  cities: GeographyCity[];
  refreshedAt: string;
  source: string;
} | null> {
  if (!hasServiceRole()) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const admin = createServiceRoleClient();
    const pending = admin
      .from("geography_snapshot_cache" as never)
      .select("cities, refreshed_at, source, total_cities")
      .eq("id", CACHE_ROW_ID)
      .abortSignal(controller.signal)
      .maybeSingle();
    // A late abort must not surface as an unhandled rejection after we already
    // fell through to the snapshot.
    void Promise.resolve(pending).then(
      () => {},
      () => {},
    );
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("geography cache read timeout"));
      }, GEOGRAPHY_CACHE_READ_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([pending, timedOut]);

    if (error) {
      // Table may not be migrated yet — fall through silently.
      console.warn("geography cache read:", error.message);
      return null;
    }
    const row = data as {
      cities: GeographyCity[];
      refreshed_at: string;
      source: string;
      total_cities: number;
    } | null;
    if (!row || !Array.isArray(row.cities) || row.cities.length === 0) {
      return null;
    }
    return {
      cities: row.cities,
      refreshedAt: row.refreshed_at,
      source: row.source,
    };
  } catch (err) {
    console.warn("geography cache read failed:", err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function writeGeographyCache(
  cities: GeographyCity[],
): Promise<{ ok: true; payload: GeographyPayload } | { ok: false; error: string }> {
  if (!hasServiceRole()) {
    return { ok: false, error: "Service role not configured" };
  }

  const normalized = toGeographyResponse(cities, "cache");
  const refreshedAt = new Date().toISOString();

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.from("geography_snapshot_cache" as never).upsert(
      {
        id: CACHE_ROW_ID,
        cities: normalized.cities,
        total_cities: normalized.totalCities,
        total_users: normalized.totalUsers,
        refreshed_at: refreshedAt,
        source: "posthog",
      } as never,
      { onConflict: "id" },
    );

    if (error) {
      console.error("geography cache write:", error.message);
      return { ok: false, error: error.message };
    }

    const payload: GeographyPayload = {
      ...normalized,
      refreshedAt,
    };
    rememberLastGoodGeography(payload);

    // Only drop the Next.js cache once we can actually read the new row.
    // If the confirming read misses, keep the previous cached response so a
    // later timeout cannot replace it with the baked fallback.
    const confirmed = await readGeographyCache();
    if (confirmed && confirmed.cities.length > 0) {
      rememberLastGoodGeography({
        ...toGeographyResponse(confirmed.cities, "cache"),
        refreshedAt: confirmed.refreshedAt,
      });
      revalidatePublicGeography();
    } else {
      console.warn(
        "geography cache write succeeded but confirming read missed; skipping revalidate",
      );
    }

    return {
      ok: true,
      payload,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    console.error("geography cache write failed:", err);
    return { ok: false, error: message };
  }
}

/**
 * Resolve map data for every UI surface (homepage and founder metrics).
 *
 * Display path is snapshot only: the shared DB row, else the baked fallback.
 * Never calls PostHog here. A live refresh on the request path is what let the
 * two maps diverge after they already shared a component (one request wrote a
 * new row while the other still served CDN or an older read).
 */
export async function resolveGeographyPayload(): Promise<GeographyPayload> {
  const cached = await readGeographyCache();
  if (cached) {
    const payload: GeographyPayload = {
      ...toGeographyResponse(cached.cities, "cache"),
      refreshedAt: cached.refreshedAt,
    };
    rememberLastGoodGeography(payload);
    return payload;
  }

  const lastGood = getLastGoodGeography();
  if (lastGood) {
    return lastGood;
  }

  return { ...toGeographyResponse(GEOGRAPHY_SNAPSHOT, "snapshot") };
}

/**
 * Daily cron: pull PostHog and upsert the cache. Returns null cities if skipped.
 * This is the only place that may call PostHog for the map.
 */
export async function refreshGeographyCacheFromPostHog(): Promise<{
  refreshed: boolean;
  reason?: string;
  totalCities?: number;
  totalUsers?: number;
  refreshedAt?: string;
}> {
  const live = await fetchLiveGeographyFromPostHog();
  if (!live) {
    return {
      refreshed: false,
      reason: process.env.POSTHOG_PERSONAL_API_KEY?.trim()
        ? "posthog_query_failed"
        : "missing_posthog_personal_api_key",
    };
  }
  if (live.length === 0) {
    return { refreshed: false, reason: "empty_result" };
  }

  const written = await writeGeographyCache(live);
  if (!written.ok) {
    return { refreshed: false, reason: written.error };
  }

  return {
    refreshed: true,
    totalCities: written.payload.totalCities,
    totalUsers: written.payload.totalUsers,
    refreshedAt: written.payload.refreshedAt,
  };
}
