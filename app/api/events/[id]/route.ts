import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign, userCanDeleteCampaign } from "@/lib/campaign-access";
import { isValidIanaTimezone } from "@/lib/event-timezone";
import type { Campaign } from "@/lib/types";
import { getPostHogClient } from "@/lib/posthog-server";

function hostBrand(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return getBrandFromHost(host);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    if (!(await userCanDeleteCampaign(supabase, user, event as Campaign))) {
      return NextResponse.json(
        { error: "Only the organization owner can delete this event" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", eventId);

    if (deleteError) {
      console.error("Error deleting event:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete event" },
        { status: 500 }
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "event_deleted",
      properties: {
        event_id: eventId,
      },
    });

    return NextResponse.json(
      { success: true, message: "Event deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in DELETE /api/events/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;

    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json();
    const name = body.name;
    const description = body.description;
    const hasOrganizerPrefs =
      body.organizer_digest_enabled !== undefined ||
      body.organizer_instant_notify_enabled !== undefined ||
      body.show_signups_publicly !== undefined ||
      body.allow_guests !== undefined ||
      body.show_capacity_publicly !== undefined ||
      body.leader_name !== undefined ||
      body.leader_email !== undefined;
    const hasEventTimezone = "event_timezone" in body;
    const hasEventDateFields =
      "event_date" in body ||
      "event_end_date" in body ||
      "event_start_time" in body ||
      "event_end_time" in body ||
      "event_times" in body ||
      "event_locations" in body ||
      "event_dates" in body;

    if (
      !hasOrganizerPrefs &&
      !hasEventTimezone &&
      !hasEventDateFields &&
      (!name || typeof name !== "string" || !String(name).trim())
    ) {
      return NextResponse.json(
        { error: "Event name is required" },
        { status: 400 }
      );
    }

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

    const updates: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
      updates.description =
        description === undefined || description === null
          ? null
          : String(description);
    }
    if (body.organizer_digest_enabled !== undefined) {
      updates.organizer_digest_enabled = Boolean(body.organizer_digest_enabled);
    }
    if (body.organizer_instant_notify_enabled !== undefined) {
      const next = Boolean(body.organizer_instant_notify_enabled);
      updates.organizer_instant_notify_enabled = next;
      // When turning on faster alerts, only future signups are notified (batch cron).
      const wasEnabled = Boolean(
        (event as Campaign).organizer_instant_notify_enabled,
      );
      if (next && !wasEnabled) {
        updates.organizer_last_instant_notify_at = new Date().toISOString();
      }
    }

    if (body.show_signups_publicly !== undefined) {
      updates.show_signups_publicly = Boolean(body.show_signups_publicly);
    }

    if (body.allow_guests !== undefined) {
      updates.allow_guests = Boolean(body.allow_guests);
    }

    if (body.show_capacity_publicly !== undefined) {
      updates.show_capacity_publicly = Boolean(body.show_capacity_publicly);
    }

    if (body.leader_name !== undefined) {
      const raw = body.leader_name;
      if (raw === null || (typeof raw === "string" && !raw.trim())) {
        updates.leader_name = null;
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length > 120) {
          return NextResponse.json({ error: "Leader name is too long (max 120 chars)" }, { status: 400 });
        }
        updates.leader_name = trimmed;
      } else {
        return NextResponse.json({ error: "Invalid leader name" }, { status: 400 });
      }
    }

    if (body.leader_email !== undefined) {
      const raw = body.leader_email;
      if (raw === null || (typeof raw === "string" && !raw.trim())) {
        updates.leader_email = null;
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          return NextResponse.json({ error: "Invalid leader email" }, { status: 400 });
        }
        updates.leader_email = trimmed;
      } else {
        return NextResponse.json({ error: "Invalid leader email" }, { status: 400 });
      }
    }

    if (body.event_timezone !== undefined) {
      const raw = body.event_timezone;
      if (raw === null || raw === "") {
        updates.event_timezone = null;
      } else {
        const tz = String(raw).trim();
        if (!isValidIanaTimezone(tz)) {
          return NextResponse.json({ error: "Invalid event timezone" }, { status: 400 });
        }
        updates.event_timezone = tz;
      }
    }

    if (body.event_date !== undefined) {
      const raw = body.event_date;
      if (raw === null || raw === "") {
        updates.event_date = null;
      } else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        updates.event_date = raw.trim();
      } else {
        return NextResponse.json({ error: "Invalid event date" }, { status: 400 });
      }
    }

    if (body.event_end_date !== undefined) {
      const raw = body.event_end_date;
      if (raw === null || raw === "") {
        updates.event_end_date = null;
      } else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        updates.event_end_date = raw.trim();
      } else {
        return NextResponse.json({ error: "Invalid event end date" }, { status: 400 });
      }
    }

    if (body.event_times !== undefined) {
      const raw = body.event_times;
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: "event_times must be an array" }, { status: 400 });
      }
      if (raw.length > 20) {
        return NextResponse.json({ error: "Too many time slots (max 20)" }, { status: 400 });
      }
      const cleaned = [];
      for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const label = typeof entry.label === "string" ? entry.label.trim() : "";
        const time = typeof entry.time === "string" ? entry.time.trim() : "";
        if (!label && !time) continue;
        if (label.length > 80 || time.length > 100) {
          return NextResponse.json({ error: "Time slot label or value is too long" }, { status: 400 });
        }
        cleaned.push({ label, time });
      }
      updates.event_times = cleaned;
    }

    if (body.event_dates !== undefined) {
      const raw = body.event_dates;
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: "event_dates must be an array" }, { status: 400 });
      }
      if (raw.length > 50) {
        return NextResponse.json({ error: "Too many dates (max 50)" }, { status: 400 });
      }
      const cleaned: string[] = [];
      for (const entry of raw) {
        if (typeof entry !== "string") continue;
        const v = entry.trim();
        if (!v) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          return NextResponse.json({ error: "Each event date must be YYYY-MM-DD" }, { status: 400 });
        }
        if (!cleaned.includes(v)) cleaned.push(v);
      }
      cleaned.sort((a, b) => a.localeCompare(b));
      updates.event_dates = cleaned;
    }

    if (body.event_locations !== undefined) {
      const raw = body.event_locations;
      if (!Array.isArray(raw)) {
        return NextResponse.json({ error: "event_locations must be an array" }, { status: 400 });
      }
      if (raw.length > 20) {
        return NextResponse.json({ error: "Too many locations (max 20)" }, { status: 400 });
      }
      const cleaned = [];
      for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const label = typeof entry.label === "string" ? entry.label.trim() : "";
        const address = typeof entry.address === "string" ? entry.address.trim() : "";
        if (!label && !address) continue;
        if (label.length > 80 || address.length > 300) {
          return NextResponse.json({ error: "Location label or address is too long" }, { status: 400 });
        }
        cleaned.push({ label, address });
      }
      updates.event_locations = cleaned;
    }

    for (const field of ["event_start_time", "event_end_time"] as const) {
      if (body[field] === undefined) continue;
      const raw = body[field];
      if (raw === null || raw === "") {
        updates[field] = null;
      } else if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          updates[field] = null;
        } else if (trimmed.length > 100) {
          return NextResponse.json({ error: `${field} is too long (max 100 chars)` }, { status: 400 });
        } else {
          // Accept either HH:MM[:SS] or free-text "approximate" time (e.g. "around 9-10am").
          updates[field] = trimmed;
        }
      } else {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data: updatedEvent, error: updateError } = await supabase
      .from("campaigns")
      .update(updates as never)
      .eq("id", eventId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating event:", updateError);
      return NextResponse.json(
        { error: "Failed to update event" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, event: updatedEvent },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in PATCH /api/events/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
