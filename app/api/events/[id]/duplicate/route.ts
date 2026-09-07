import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { checkEventLimit } from "@/lib/event-limit";
import { diffDays, earliestYmd, isYmd, shiftNullableYmd, shiftYmd } from "@/lib/date-shift";
import { compareBySortOrder, isMissingSortOrderError, stripSortOrder } from "@/lib/session-sort-order";
import type { Campaign, CampaignItem, Database, Session } from "@/lib/types";
import { getPostHogClient } from "@/lib/posthog-server";

type CampaignInsert = Database["public"]["Tables"]["campaigns"]["Insert"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

/**
 * POST /api/events/[id]/duplicate — deep-copy an event the user can administer.
 *
 * Copies the campaign row plus its sessions (spots) and campaign_items, but NOT
 * signups/item_signups — the duplicate starts empty. An optional `new_start_date`
 * (YYYY-MM-DD) shifts every date on the copy (event dates, end date, and each
 * session date) by the same delta relative to the source's earliest date, so a
 * recurring event can be cloned forward to a new week/month in one step.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sourceId } = await params;

    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { data: sourceRow, error: sourceError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (sourceError || !sourceRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const source = sourceRow as Campaign;

    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);
    if (!campaignMatchesHostBrand(source.brand_id, brand)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await userCanAdminCampaign(supabase, user, source))) {
      return NextResponse.json(
        { error: "You do not have permission to duplicate this event" },
        { status: 403 },
      );
    }

    // Per-org override on the free-beta cap keys off the org name.
    let orgName: string | null = null;
    if (source.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", source.organization_id)
        .maybeSingle();
      orgName = (org as { name: string } | null)?.name ?? null;
    }
    const limit = await checkEventLimit(supabase, user, brand.id, orgName);
    if (!limit.ok) {
      return NextResponse.json({ error: limit.error }, { status: limit.status });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    const newName = rawName || `Copy of ${source.name}`;
    if (newName.length > 200) {
      return NextResponse.json({ error: "Event name is too long" }, { status: 400 });
    }

    const newStart = body?.new_start_date;
    if (newStart !== undefined && newStart !== null && newStart !== "" && !isYmd(newStart)) {
      return NextResponse.json(
        { error: "new_start_date must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // Load the children we're copying up front — sessions also feed the anchor date.
    const [{ data: sessionRows }, { data: itemRows }] = await Promise.all([
      supabase
        .from("sessions")
        .select("*")
        .eq("campaign_id", sourceId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("campaign_items")
        .select("label, item_limit, section, sort_order")
        .eq("campaign_id", sourceId),
    ]);
    // Sort by sort_order client-side (server-side .order would error on a brand
    // whose migration hasn't run); falls back to created_at/id when absent.
    const sessions = ((sessionRows as Session[] | null) ?? [])
      .slice()
      .sort(compareBySortOrder);
    const items = (itemRows as Pick<CampaignItem, "label" | "item_limit" | "section" | "sort_order">[] | null) ?? [];

    // Shift is relative to the source's earliest date across all its date fields.
    let shiftDays = 0;
    if (isYmd(newStart)) {
      const anchor = earliestYmd([
        source.event_date,
        ...(Array.isArray(source.event_dates) ? source.event_dates : []),
        ...sessions.map((s) => s.session_date),
      ]);
      if (anchor) shiftDays = diffDays(anchor, newStart) ?? 0;
    }

    const insertRow: CampaignInsert = {
      name: newName,
      description: source.description,
      user_email: user.email ?? null,
      created_by: user.id,
      // Fresh copy: don't carry over digest/notify send timestamps.
      organizer_digest_enabled: source.organizer_digest_enabled,
      organizer_instant_notify_enabled: source.organizer_instant_notify_enabled,
      brand_id: source.brand_id,
      public_host: source.public_host,
      event_timezone: source.event_timezone,
      show_signups_publicly: source.show_signups_publicly,
      cover_image_url: source.cover_image_url,
      event_type: source.event_type,
      allow_guests: source.allow_guests,
      show_capacity_publicly: source.show_capacity_publicly,
      event_date: shiftNullableYmd(source.event_date, shiftDays),
      event_end_date: shiftNullableYmd(source.event_end_date, shiftDays),
      event_start_time: source.event_start_time,
      event_end_time: source.event_end_time,
      event_times: source.event_times ?? [],
      event_locations: source.event_locations ?? [],
      event_dates: Array.isArray(source.event_dates)
        ? source.event_dates.map((d) => shiftYmd(d, shiftDays))
        : [],
      organization_id: source.organization_id,
    };

    const { data: created, error: insertError } = await supabase
      .from("campaigns")
      .insert(insertRow as never)
      .select()
      .single();

    if (insertError || !created) {
      console.error("Error duplicating event (campaign insert):", insertError);
      return NextResponse.json({ error: "Failed to duplicate event" }, { status: 500 });
    }
    const newId = (created as Campaign).id;

    // Copy children. On failure, roll back the new campaign so we don't leave a
    // half-populated duplicate (sessions/items cascade-delete with the campaign).
    if (sessions.length > 0) {
      // Preserve the source's slot order on the copy via sort_order (source is
      // fetched already ordered by it).
      const rows: SessionInsert[] = sessions.map((s, i) => ({
        campaign_id: newId,
        day_of_week: s.day_of_week,
        time: s.time,
        end_time: s.end_time,
        capacity: s.capacity,
        location: s.location,
        notes: s.notes,
        session_date: shiftNullableYmd(s.session_date, shiftDays),
        label: s.label,
        section: s.section,
        sort_order: i,
      }));
      let { error: sessionError } = await supabase.from("sessions").insert(rows as never);
      if (sessionError && isMissingSortOrderError(sessionError)) {
        // Brand not migrated yet — retry without the sort_order column.
        ({ error: sessionError } = await supabase
          .from("sessions")
          .insert(stripSortOrder(rows as Record<string, unknown>[]) as never));
      }
      if (sessionError) {
        console.error("Error duplicating event (sessions insert):", sessionError);
        await supabase.from("campaigns").delete().eq("id", newId);
        return NextResponse.json({ error: "Failed to duplicate event" }, { status: 500 });
      }
    }

    if (items.length > 0) {
      const rows = items.map((it) => ({
        campaign_id: newId,
        label: it.label,
        item_limit: it.item_limit,
        section: it.section,
        sort_order: it.sort_order,
      }));
      const { error: itemError } = await supabase.from("campaign_items").insert(rows as never);
      if (itemError) {
        console.error("Error duplicating event (items insert):", itemError);
        await supabase.from("campaigns").delete().eq("id", newId);
        return NextResponse.json({ error: "Failed to duplicate event" }, { status: 500 });
      }
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "event_duplicated",
      properties: {
        source_event_id: sourceId,
        event_id: newId,
        shift_days: shiftDays,
        session_count: sessions.length,
        item_count: items.length,
      },
    });

    return NextResponse.json({ success: true, event: created }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/events/[id]/duplicate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
