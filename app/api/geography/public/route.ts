import { NextResponse } from "next/server";
import {
  GEOGRAPHY_PUBLIC_CACHE_CONTROL,
  resolveGeographyPayload,
} from "@/lib/geography-cache";

export const maxDuration = 60;
/**
 * Hourly ISR window. The snapshot row refreshes once a day; the writer also
 * calls revalidatePath on this route so both maps update without waiting.
 * Keep in sync with GEOGRAPHY_PUBLIC_CACHE_CONTROL (must be a literal here).
 */
export const revalidate = 3600;

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
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": GEOGRAPHY_PUBLIC_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error("Geography public API error:", error);
    // Fallback to baked snapshot on any error
    const { toGeographyResponse, GEOGRAPHY_SNAPSHOT } = await import(
      "@/lib/geography-snapshot"
    );
    return NextResponse.json({
      ...toGeographyResponse(GEOGRAPHY_SNAPSHOT, "snapshot"),
      source: "snapshot",
    });
  }
}
