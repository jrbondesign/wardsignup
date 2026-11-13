import { NextResponse } from "next/server";
import {
  GEOGRAPHY_CDN_TAG,
  GEOGRAPHY_FALLBACK_CACHE_CONTROL,
  GEOGRAPHY_PUBLIC_CACHE_CONTROL,
  geographyCacheHeaders,
  getLastGoodGeography,
  resolveGeographyPayload,
} from "@/lib/geography-cache";

export const maxDuration = 60;
/**
 * Do not prerender. A build-time read of geography_snapshot_cache queries
 * production Supabase with no timeout and fails the Vercel build. The CDN
 * still caches a good cache-row response via CDN-Cache-Control /
 * Vercel-CDN-Cache-Control (Cache-Control alone is stripped) on
 * GEOGRAPHY_PUBLIC_CACHE_CONTROL (6h, then stale-while-revalidate). A
 * baked-snapshot fallback uses GEOGRAPHY_FALLBACK_CACHE_CONTROL (private,
 * no-store) so it cannot pin a stale count at the edge. A thrown error also stays private, no-store,
 * unless this instance already has a last-good payload to serve instead.
 */
export const dynamic = "force-dynamic";

/**
 * Public geography endpoint for the homepage and founder metrics maps.
 * Returns ONLY city-level aggregates (city, country, lat, lng, userCount).
 * No PII, emails, names, or person identifiers are ever exposed.
 *
 * Data sources (in preference order):
 * 1. DB cache (geography_snapshot_cache, refreshed daily by cron)
 * 2. Per-instance in-memory last-good payload from a prior successful read
 * 3. Baked snapshot fallback (GEOGRAPHY_SNAPSHOT constant)
 *
 * Display never calls PostHog. One row, one endpoint, both maps match.
 */
function cacheableGeographyHeaders() {
  return geographyCacheHeaders(GEOGRAPHY_PUBLIC_CACHE_CONTROL, GEOGRAPHY_CDN_TAG);
}

function fallbackGeographyHeaders() {
  return geographyCacheHeaders(GEOGRAPHY_FALLBACK_CACHE_CONTROL);
}

export async function GET() {
  try {
    const payload = await resolveGeographyPayload();
    // Last-good is also source "cache". Only the baked snapshot (or an empty
    // list) uses the non-cacheable fallback headers, so the CDN will not
    // replace a good copy with the September-style stale counts.
    const fromCacheRow = payload.source === "cache" && payload.cities.length > 0;
    return NextResponse.json(payload, {
      headers: fromCacheRow
        ? cacheableGeographyHeaders()
        : fallbackGeographyHeaders(),
    });
  } catch (error) {
    console.error("Geography public API error:", error);
    const lastGood = getLastGoodGeography();
    if (lastGood && lastGood.cities.length > 0) {
      return NextResponse.json(lastGood, {
        headers: cacheableGeographyHeaders(),
      });
    }
    // Last resort: baked snapshot. Do not cache it at the CDN.
    const { toGeographyResponse, GEOGRAPHY_SNAPSHOT } = await import(
      "@/lib/geography-snapshot"
    );
    return NextResponse.json(
      {
        ...toGeographyResponse(GEOGRAPHY_SNAPSHOT, "snapshot"),
        source: "snapshot",
      },
      { headers: fallbackGeographyHeaders() },
    );
  }
}
