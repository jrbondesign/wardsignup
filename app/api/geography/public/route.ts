import { NextResponse } from "next/server";
import {
  GEOGRAPHY_PUBLIC_CACHE_CONTROL,
  resolveGeographyPayload,
} from "@/lib/geography-cache";

export const maxDuration = 60;
/**
 * Do not prerender. A build-time read of geography_snapshot_cache queries
 * production Supabase with no timeout and fails the Vercel build. CDN
 * freshness stays on GEOGRAPHY_PUBLIC_CACHE_CONTROL (s-maxage 3600, then
 * stale-while-revalidate). Empty and error bodies are not cached.
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
    const cacheable = payload.cities.length > 0;
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": cacheable
          ? GEOGRAPHY_PUBLIC_CACHE_CONTROL
          : "private, no-store",
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
