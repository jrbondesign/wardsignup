import { NextResponse } from "next/server";
import {
  GEOGRAPHY_CDN_TAG,
  GEOGRAPHY_FALLBACK_CACHE_CONTROL,
  GEOGRAPHY_PUBLIC_CACHE_CONTROL,
  resolveGeographyPayload,
} from "@/lib/geography-cache";

export const maxDuration = 60;
/**
 * Do not prerender. A build-time read of geography_snapshot_cache queries
 * production Supabase with no timeout and fails the Vercel build. The CDN
 * still caches the response: a cache row on GEOGRAPHY_PUBLIC_CACHE_CONTROL
 * (6h, then stale-while-revalidate), the baked snapshot or an empty list on
 * GEOGRAPHY_FALLBACK_CACHE_CONTROL (5 min). A thrown error stays private,
 * no-store.
 */
export const dynamic = "force-dynamic";

/**
 * Public geography endpoint for the homepage and founder metrics maps.
 * Returns ONLY city-level aggregates (city, country, lat, lng, userCount).
 * No PII, emails, names, or person identifiers are ever exposed.
 *
 * Data sources (in preference order):
 * 1. DB cache (geography_snapshot_cache, refreshed daily by cron; the writer
 *    revalidates this route on demand)
 * 2. Baked snapshot fallback (GEOGRAPHY_SNAPSHOT constant)
 *
 * Display never calls PostHog. One row, one endpoint, both maps match.
 */
export async function GET() {
  try {
    const payload = await resolveGeographyPayload();
    // A snapshot fallback means the cache read missed or timed out. Keep it
    // only briefly at the CDN so the database is retried within 5 minutes
    // without every homepage view piling onto a stalled database.
    const fromCacheRow = payload.source === "cache" && payload.cities.length > 0;
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": fromCacheRow
          ? GEOGRAPHY_PUBLIC_CACHE_CONTROL
          : GEOGRAPHY_FALLBACK_CACHE_CONTROL,
        "Vercel-Cache-Tag": GEOGRAPHY_CDN_TAG,
      },
    });
  } catch (error) {
    console.error("Geography public API error:", error);
    // Fallback to baked snapshot on any error. Do not cache the error body.
    const { toGeographyResponse, GEOGRAPHY_SNAPSHOT } = await import(
      "@/lib/geography-snapshot"
    );
    return NextResponse.json(
      {
        ...toGeographyResponse(GEOGRAPHY_SNAPSHOT, "snapshot"),
        source: "snapshot",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
