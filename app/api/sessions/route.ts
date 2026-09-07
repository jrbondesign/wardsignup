import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { isMissingSortOrderError, stripSortOrder } from "@/lib/session-sort-order";
import {
  getMaxSessionsPerCampaign,
  getMaxSessionsPerRequest,
  getMaxSessionCapacity,
} from "@/lib/limits";
import type { Campaign, Database } from "@/lib/types";
import { getPostHogClient } from "@/lib/posthog-server";

type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json();
    const { campaign_id, sessions } = body;

    if (!campaign_id || !sessions || !Array.isArray(sessions)) {
      return NextResponse.json(
        { error: "Event ID and sessions array are required" },
        { status: 400 }
      );
    }

    const { data: campaignRow, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id, brand_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaignRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);
    if (
      !campaignMatchesHostBrand(
        (campaignRow as { brand_id?: string }).brand_id,
        brand,
      )
    ) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const campaign = campaignRow as Pick<Campaign, "id" | "organization_id">;

    if (!(await userCanAdminCampaign(supabase, user, campaign))) {
      return NextResponse.json(
        { error: "You do not have permission to add sessions to this event" },
        { status: 403 }
      );
    }

    const maxPerCampaign = getMaxSessionsPerCampaign();
    const maxPerRequest = getMaxSessionsPerRequest();
    const maxCap = getMaxSessionCapacity();

    if (sessions.length > maxPerRequest) {
      return NextResponse.json(
        { error: `You can add at most ${maxPerRequest} sessions per request.` },
        { status: 400 }
      );
    }

    for (const raw of sessions) {
      if (!raw || typeof raw !== "object") {
        return NextResponse.json({ error: "Invalid session entry" }, { status: 400 });
      }
      const s = raw as Record<string, unknown>;
      const cap = Number(s.capacity);
      // 999 is the unlimited sentinel used by rsvp (single) events — allow it through
      const isUnlimitedSentinel = cap === 999;
      if (!Number.isFinite(cap) || cap < 1 || (!isUnlimitedSentinel && cap > maxCap)) {
        return NextResponse.json(
          { error: `Each session must have between 1 and ${maxCap} spots.` },
          { status: 400 }
        );
      }
    }

    const { count: existingSessionCount, error: sessCountErr } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id);

    if (sessCountErr) {
      console.error("Session count error:", sessCountErr);
      return NextResponse.json({ error: "Failed to verify session limit" }, { status: 500 });
    }

    if ((existingSessionCount ?? 0) + sessions.length > maxPerCampaign) {
      return NextResponse.json(
        {
          error: `This event cannot have more than ${maxPerCampaign} sessions total.`,
        },
        { status: 400 }
      );
    }

    const sortBase = existingSessionCount ?? 0;
    const sessionsToInsert: SessionInsert[] = sessions.map((raw: unknown, i: number) => {
      const session = raw as Record<string, unknown>;
      const sessionDate =
        session.session_date == null || session.session_date === ""
          ? null
          : String(session.session_date);
      // Compute day_of_week from session_date if not explicitly provided,
      // so callers (e.g. MCP) don't need to send it.
      let dayOfWeek = Number(session.day_of_week);
      if (!Number.isFinite(dayOfWeek) && sessionDate) {
        // Parse as noon UTC to avoid date-shift across timezones
        dayOfWeek = new Date(`${sessionDate}T12:00:00Z`).getUTCDay();
      }
      return {
        campaign_id,
        day_of_week: dayOfWeek,
        time: String(session.time ?? ""),
        end_time: session.end_time == null || session.end_time === "" ? null : String(session.end_time),
        capacity: Number(session.capacity),
        location: session.location == null || session.location === "" ? null : String(session.location),
        notes: session.notes == null || session.notes === "" ? null : String(session.notes),
        session_date: sessionDate,
        label: session.label == null || session.label === "" ? null : String(session.label).slice(0, 120),
        section: session.section == null || session.section === "" ? null : String(session.section).slice(0, 80),
        sort_order: sortBase + i,
      };
    });

    let { data, error } = await supabase
      .from("sessions")
      .insert(sessionsToInsert as never)
      .select();

    if (error && isMissingSortOrderError(error)) {
      // Brand not migrated yet — retry without the sort_order column.
      ({ data, error } = await supabase
        .from("sessions")
        .insert(stripSortOrder(sessionsToInsert as unknown as Record<string, unknown>[]) as never)
        .select());
    }

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to create sessions" },
        { status: 500 }
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "sessions_created",
      properties: {
        campaign_id,
        session_count: sessions.length,
      },
    });

    return NextResponse.json({ sessions: data });
  } catch (error) {
    console.error("Error creating sessions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
