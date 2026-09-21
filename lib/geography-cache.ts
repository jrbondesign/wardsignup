import { createServiceRoleClient } from "@/lib/supabase-admin";
import {
  GEOGRAPHY_HOGQL,
  GEOGRAPHY_SNAPSHOT,
  toGeographyResponse,
  type GeographyCity,
} from "@/lib/geography-snapshot";

/** Daily cadence: cache is fresh for ~1 day; cron refreshes once per UTC day. */
export const GEOGRAPHY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Soft stale window: still serve cache while allowing lazy refresh. */
export const GEOGRAPHY_CACHE_STALE_MS = 36 * 60 * 60 * 1000;

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/$/, "") ||
  "https://us.i.posthog.com";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || "370646";
const CACHE_ROW_ID = "default";

export type GeographySource = "cache" | "live" | "snapshot";

export type GeographyPayload = ReturnType<typeof toGeographyResponse> & {
  refreshedAt?: string;
};

function hasServiceRole(): boolean {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
        process.env.SUPABASE_URL?.trim()),
  );
}

export async function fetchLiveGeographyFromPostHog(): Promise<GeographyCity[] | null> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  if (!apiKey) return null;

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
          query: GEOGRAPHY_HOGQL,
        },
      }),
      // Daily cadence — avoid hammering PostHog from concurrent page loads.
      next: { revalidate: 86400 },
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
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from("geography_snapshot_cache" as never)
      .select("cities, refreshed_at, source, total_cities")
      .eq("id", CACHE_ROW_ID)
      .maybeSingle();

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

    return {
      ok: true,
      payload: {
        ...normalized,
        refreshedAt,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    console.error("geography cache write failed:", err);
    return { ok: false, error: message };
  }
}

function cacheAgeMs(refreshedAt: string): number {
  return Date.now() - new Date(refreshedAt).getTime();
}

/**
 * Resolve map data for public/admin UI.
 * Prefer daily DB cache → live PostHog (and persist) → baked snapshot.
 */
export async function resolveGeographyPayload(): Promise<GeographyPayload> {
  const cached = await readGeographyCache();
  if (cached && cacheAgeMs(cached.refreshedAt) <= GEOGRAPHY_CACHE_STALE_MS) {
    const payload = toGeographyResponse(cached.cities, "cache");
    return {
      ...payload,
      refreshedAt: cached.refreshedAt,
    };
  }

  const live = await fetchLiveGeographyFromPostHog();
  if (live && live.length > 0) {
    const written = await writeGeographyCache(live);
    if (written.ok) return written.payload;
    const payload = toGeographyResponse(live, "live");
    return { ...payload };
  }

  // Stale cache is better than the static bake-in if we have one.
  if (cached) {
    const payload = toGeographyResponse(cached.cities, "cache");
    return {
      ...payload,
      refreshedAt: cached.refreshedAt,
    };
  }

  const baked = toGeographyResponse(GEOGRAPHY_SNAPSHOT, "snapshot");
  return { ...baked };
}

/**
 * Daily cron: pull PostHog and upsert the cache. Returns null cities if skipped.
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
