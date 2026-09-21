import { NextResponse } from "next/server";
import { resolveGeographyPayload } from "@/lib/geography-cache";

export const maxDuration = 60;
/** Daily cadence — response cache aligns with cron refresh. */
export const revalidate = 86400;

/**
 * Public geography endpoint for homepage "Our Community" map.
 * Returns ONLY city-level aggregates (city, country, lat, lng, userCount).
 * No PII, emails, names, or person identifiers are ever exposed.
 * 
 * Data sources (in preference order):
 * 1. DB cache (geography_snapshot_cache table, refreshed daily by cron)
 * 2. Baked snapshot fallback (GEOGRAPHY_SNAPSHOT constant)
 * 
 * Security: This endpoint exposes aggregate city-level statistics only.
 * All person-level data remains behind authentication.
 */
export async function GET() {
  try {
    const payload = await resolveGeographyPayload();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
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
