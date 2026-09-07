import { NextResponse } from "next/server";
import { getBrandFromHost } from "@/lib/brand";
import { getAuthFromRequest } from "@/lib/auth";
import { checkEventLimit } from "@/lib/event-limit";
import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";
import { isValidIanaTimezone } from "@/lib/event-timezone";
import { getCurrentOrganization } from "@/lib/organizations";
import type { Database } from "@/lib/types";
import { getPostHogClient } from "@/lib/posthog-server";

type CampaignInsert = Database["public"]["Tables"]["campaigns"]["Insert"];

export async function GET(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);

    // RLS limits to campaigns whose org the user is an accepted member of.
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, name, description, event_type, created_at, brand_id, public_host, event_timezone")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("GET /api/events error:", error);
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    console.error("GET /api/events unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);
    const brandGate = await ensureOrganizerBrandMatchesHost(supabase, user.id, brand);
    if (!brandGate.ok) {
      return NextResponse.json({ error: brandGate.message }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, event_timezone, event_type, allow_guests, show_capacity_publicly, event_date, event_end_date } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Event name is required" },
        { status: 400 }
      );
    }

    // Org must exist before creating an event. UI calls POST /api/organizations first
    // when the user has none yet; surface a structured error otherwise so clients can
    // prompt for a name and retry. Resolved before the limit check so per-org overrides
    // (e.g. Sweetwater Branch) can raise the cap.
    const org = await getCurrentOrganization(supabase, user, brand.id);
    if (!org) {
      return NextResponse.json(
        { error: "Name your organization to create your first event", code: "org_name_required" },
        { status: 422 },
      );
    }

    const limit = await checkEventLimit(supabase, user, brand.id, org.name);
    if (!limit.ok) {
      return NextResponse.json({ error: limit.error }, { status: limit.status });
    }

    const user_email = user.email ?? null;
    const created_by = user.id;

    let eventTimezone: string | null = null;
    if (event_timezone !== undefined && event_timezone !== null) {
      const tz = String(event_timezone).trim();
      if (tz && !isValidIanaTimezone(tz)) {
        return NextResponse.json({ error: "Invalid event timezone" }, { status: 400 });
      }
      eventTimezone = tz || null;
    }

    const resolvedEventType: string =
      event_type === "items" ? "items"
      : event_type === "rsvp" ? "rsvp"
      : "spots";

    // allow_guests: default true for rsvp (single events bring family),
    //               default false for scheduled sessions, true for items (N/A but harmless)
    const resolvedAllowGuests: boolean =
      typeof allow_guests === "boolean" ? allow_guests
      : resolvedEventType === "rsvp" ? true : false;

    const resolvedShowCapacity: boolean =
      typeof show_capacity_publicly === "boolean" ? show_capacity_publicly : true;

    const isIsoDate = (v: unknown): v is string =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const eventDateValue = isIsoDate(event_date) ? event_date : null;
    const eventEndDateValue =
      isIsoDate(event_end_date) && eventDateValue && event_end_date > eventDateValue
        ? event_end_date
        : null;

    const insertRow: CampaignInsert = {
      name,
      description: description || null,
      user_email,
      created_by,
      organizer_digest_enabled: true,
      brand_id: brand.id,
      public_host: brand.siteHost,
      event_timezone: eventTimezone,
      event_type: resolvedEventType,
      allow_guests: resolvedAllowGuests,
      show_capacity_publicly: resolvedShowCapacity,
      event_date: eventDateValue,
      event_end_date: eventEndDateValue,
      organization_id: org.id,
    } as CampaignInsert;

    const { data, error } = await supabase
      .from("campaigns")
      // Manual Database type does not satisfy postgrest-js GenericSchema; Insert is still checked via insertRow above.
      .insert(insertRow as never)
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      // RLS on campaigns INSERT requires an accepted owner row in
      // organization_members. If the seed_owner_membership trigger didn't fire
      // (older orgs created before the trigger landed), the insert is denied
      // with code 42501. Surface a more actionable message instead of "Failed
      // to create event" so the user / support can act.
      if (error.code === "42501") {
        return NextResponse.json(
          {
            error:
              "Your organization is missing an owner membership row — contact support@ministrysignup.com to fix.",
            code: "org_member_missing",
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "event_created",
      properties: {
        event_id: (data as { id?: string })?.id,
        event_type: resolvedEventType,
        brand_id: brand.id,
        has_description: Boolean(description),
        has_timezone: Boolean(eventTimezone),
      },
    });

    return NextResponse.json({ event: data });
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
