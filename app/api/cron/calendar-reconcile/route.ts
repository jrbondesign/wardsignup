import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { syncCampaignCalendar } from "@/lib/google-calendar-sync";
import { isGcalSyncFeatureEnabled } from "@/lib/gcal-feature";
import { claimCronRun, hourBucketDate } from "@/lib/rate-limit";
import { loadEnabledCampaignIdsWithUpcomingSessions } from "@/lib/calendar-reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reconcile cron — sync enabled campaigns with future sessions.
 * Runs hourly via GitHub Actions.
 * Bound to ~50 campaigns per run to stay under Actions 60s timeout.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 500 }
      );
    }

    const auth = request.headers.get("authorization")?.trim();
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isGcalSyncFeatureEnabled()) {
      return NextResponse.json({ 
        ok: true, 
        message: "Calendar sync feature disabled",
        synced: 0 
      });
    }

    // Claim this cron run to prevent concurrent execution (hourly cadence)
    const claim = await claimCronRun("calendar-reconcile", hourBucketDate());
    
    if (!claim.claimed) {
      return NextResponse.json({
        ok: true,
        message: "Already ran this hour",
        synced: 0
      });
    }

    const admin = createServiceRoleClient();

    try {
      const { campaignIds, error: campaignsError } =
        await loadEnabledCampaignIdsWithUpcomingSessions(admin);

      if (campaignsError) {
        console.error("Calendar reconcile: failed to load campaigns:", campaignsError);
        return NextResponse.json(
          { error: "Failed to load campaigns" },
          { status: 500 }
        );
      }

      const results = {
        total: campaignIds.length,
        success: 0,
        failed: 0,
      };

      // Sync each campaign
      for (const campaignId of campaignIds) {
        try {
          const result = await syncCampaignCalendar(campaignId);
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            console.error(`Calendar reconcile: sync failed for ${campaignId}:`, result.error);
          }
        } catch (err) {
          results.failed++;
          console.error(`Calendar reconcile: unexpected error for ${campaignId}:`, err);
        }
      }

      return NextResponse.json({
        ok: true,
        ...results,
      });
    } catch (innerErr) {
      throw innerErr;
    }
  } catch (err) {
    console.error("Calendar reconcile cron error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
