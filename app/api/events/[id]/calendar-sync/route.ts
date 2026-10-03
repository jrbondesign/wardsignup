import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import type { Campaign } from "@/lib/types";
import { syncCampaignCalendar } from "@/lib/google-calendar-sync";
import { isGcalSyncFeatureEnabled, isGcalSyncEnabledForOrg } from "@/lib/gcal-feature";
import { getPostHogClient } from "@/lib/posthog-server";

function hostBrand(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return getBrandFromHost(host);
}

/** PATCH /api/events/[id]/calendar-sync — update calendar sync settings */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isGcalSyncFeatureEnabled()) {
      return NextResponse.json(
        { error: "Calendar sync is not enabled" },
        { status: 403 }
      );
    }

    const { id: eventId } = await params;

    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { data: event, error: eventError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const brand = hostBrand(request);
    if (!campaignMatchesHostBrand((event as Campaign).brand_id, brand)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await userCanAdminCampaign(supabase, user, event as Campaign))) {
      return NextResponse.json(
        { error: "You do not have permission to edit this event" },
        { status: 403 }
      );
    }

    // Require org allowlist check
    const orgId = (event as Campaign).organization_id;
    if (!orgId || !isGcalSyncEnabledForOrg(orgId)) {
      return NextResponse.json(
        { error: "Calendar sync is not enabled for this organization" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if ("enabled" in body) {
      updates.enabled = Boolean(body.enabled);
    }

    if ("calendar_id" in body) {
      updates.calendar_id = String(body.calendar_id || "");
    }

    if ("calendar_name" in body) {
      updates.calendar_name = String(body.calendar_name || "");
    }

    if ("invite_leader" in body) {
      updates.invite_leader = Boolean(body.invite_leader);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update or insert campaign_calendar_sync
    const { data: existing } = await supabase
      .from("campaign_calendar_sync")
      .select("*")
      .eq("campaign_id", eventId)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("campaign_calendar_sync")
        .update(updates as never)
        .eq("campaign_id", eventId)
        .select()
        .single();

      if (error) {
        console.error("Error updating calendar sync:", error);
        return NextResponse.json(
          { error: "Failed to update calendar sync" },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // If no existing record and we're just turning sync off, that's a no-op
      if (updates.enabled === false) {
        return NextResponse.json(
          {
            success: true,
            last_synced_at: null,
            last_error: null,
          },
          { status: 200 }
        );
      }

      // Creating a new record requires calendar selection
      if (!("calendar_id" in updates) || !updates.calendar_id || !("calendar_name" in updates) || !updates.calendar_name) {
        return NextResponse.json(
          { error: "Please select a calendar to sync with." },
          { status: 400 }
        );
      }

      // Get the user's google calendar connection
      const orgId = (event as Campaign).organization_id;
      if (!orgId) {
        return NextResponse.json(
          { error: "Event has no organization" },
          { status: 400 }
        );
      }

      const { data: connection } = await supabase
        .from("google_calendar_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", orgId)
        .is("revoked_at", null)
        .single();

      if (!connection) {
        return NextResponse.json(
          { error: "No Google Calendar connection found. Connect your account first." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("campaign_calendar_sync")
        .insert({
          campaign_id: eventId,
          connection_id: (connection as any).id,
          ...updates,
        } as never)
        .select()
        .single();

      if (error) {
        console.error("Error creating calendar sync:", error);
        return NextResponse.json(
          { error: "Failed to create calendar sync" },
          { status: 500 }
        );
      }
      result = data;
      
      // Fire PostHog event for calendar sync enabled
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: user.id,
        event: "gcal_sync_enabled",
        properties: {
          event_id: eventId,
          calendar_id: updates.calendar_id,
          invite_leader: updates.invite_leader || false,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        last_synced_at: (result as any).last_synced_at,
        last_error: (result as any).last_error,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in PATCH /api/events/[id]/calendar-sync:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** POST /api/events/[id]/calendar-sync — trigger immediate sync */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isGcalSyncFeatureEnabled()) {
      return NextResponse.json(
        { error: "Calendar sync is not enabled" },
        { status: 403 }
      );
    }

    const { id: eventId } = await params;

    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { data: event, error: eventError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const brand = hostBrand(request);
    if (!campaignMatchesHostBrand((event as Campaign).brand_id, brand)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await userCanAdminCampaign(supabase, user, event as Campaign))) {
      return NextResponse.json(
        { error: "You do not have permission to sync this event" },
        { status: 403 }
      );
    }

    // Require org allowlist check
    const orgId = (event as Campaign).organization_id;
    if (!orgId || !isGcalSyncEnabledForOrg(orgId)) {
      return NextResponse.json(
        { error: "Calendar sync is not enabled for this organization" },
        { status: 403 }
      );
    }

    // Trigger sync
    const result = await syncCampaignCalendar(eventId);

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          last_synced_at: result.lastSyncedAt,
          last_error: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        last_synced_at: result.lastSyncedAt,
        last_error: null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in POST /api/events/[id]/calendar-sync:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
