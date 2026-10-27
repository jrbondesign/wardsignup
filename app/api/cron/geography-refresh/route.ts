import { NextRequest, NextResponse } from "next/server";
import { claimCronRun } from "@/lib/rate-limit";
import { phoenixDayStartUtc } from "@/lib/phoenix-time";
import { refreshGeographyCacheFromPostHog } from "@/lib/geography-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily geography map refresh.
 * Pulls PostHog GeoIP city aggregates and upserts geography_snapshot_cache.
 * Secured with Authorization: Bearer CRON_SECRET.
 * Schedule: vercel.json "0 15 * * *" = 15:00 UTC = 8:00 AM Phoenix.
 * Idempotent once per Phoenix (Arizona) calendar day via claimCronRun: the
 * claim bucket is Phoenix midnight (07:00Z), not UTC midnight, so the guard
 * rolls over at 12 AM Arizona time instead of 5 PM.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claim = await claimCronRun("geography-refresh", phoenixDayStartUtc());
  if (!claim.claimed) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: claim.reason ?? "already_claimed_today",
    });
  }

  try {
    const result = await refreshGeographyCacheFromPostHog();
    if (!result.refreshed) {
      // Soft skip — missing key or empty data should not page Vercel as a hard fail.
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: result.reason ?? "refresh_failed",
      });
    }

    return NextResponse.json({
      ok: true,
      refreshed: true,
      totalCities: result.totalCities,
      totalUsers: result.totalUsers,
      refreshedAt: result.refreshedAt,
    });
  } catch (err) {
    console.error("geography-refresh cron:", err);
    return NextResponse.json(
      { error: "Geography refresh failed" },
      { status: 500 },
    );
  }
}
