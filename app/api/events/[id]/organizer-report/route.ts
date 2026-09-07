import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import type { Campaign } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { consumeEmailKeyRate } from "@/lib/email-send";

export const dynamic = "force-dynamic";

/** POST — send metrics email now (manual report). Auth: event owner. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);
    if (!campaignMatchesHostBrand((event as Campaign).brand_id, brand)) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!(await userCanAdminCampaign(supabase, user, event as Campaign))) {
      return NextResponse.json(
        { error: "You do not have permission" },
        { status: 403 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 },
      );
    }

    let admin: ReturnType<typeof createServiceRoleClient>;
    try {
      admin = createServiceRoleClient();
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Config error" },
        { status: 500 },
      );
    }

    // Manual reports are unlimited-click by nature; cap per event per hour so
    // a stuck client (or abuse of an organizer-controlled address) can't loop.
    const underCap = await consumeEmailKeyRate(
      "organizer_report_manual",
      `organizer-report:${eventId}`,
      5,
    );
    if (!underCap) {
      return NextResponse.json(
        { error: "Report limit reached for this hour. Please try again later." },
        { status: 429 },
      );
    }

    const result = await sendOrganizerMetricsEmail(admin, eventId, "manual");

    if (!result.ok) {
      if (result.skipped === "no_organizer_email") {
        return NextResponse.json(
          { error: "No organizer email on file. Add your email to the event or sign in with the account that created it." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...(result.resendId ? { resendId: result.resendId } : {}),
      ...(result.sentTo ? { sentTo: result.sentTo } : {}),
    });
  } catch (error) {
    console.error("POST organizer-report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
