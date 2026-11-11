import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import type { Campaign } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { sendOrganizerMetricsEmail } from "@/lib/organizer-email";
import { consumeEmailKeyRate, consumeEmailKeyRateCount } from "@/lib/email-send";
import { isBrevoCutoverEnabled } from "@/lib/email-cutover-config";

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
    // While the gate is on, the consumed count is the operation id so clicks
    // 2 through 5 are mailed instead of colliding with the first click.
    let operationId: string | undefined;
    if (isBrevoCutoverEnabled()) {
      const slot = await consumeEmailKeyRateCount(
        "organizer_report_manual",
        `organizer-report:${eventId}`,
        5,
      );
      if (slot === "unavailable") {
        return NextResponse.json(
          { error: "The report could not be started. Please try again later.", retryable: true },
          { status: 503 },
        );
      }
      if (slot == null) {
        return NextResponse.json(
          { error: "Report limit reached for this hour. Please try again later." },
          { status: 429 },
        );
      }
      operationId = String(slot);
    } else {
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
    }

    const result = await sendOrganizerMetricsEmail(admin, eventId, "manual", { operationId });

    if (result.queued) {
      return NextResponse.json(
        { ok: true, delivery: "queued", ...(result.sentTo ? { sentTo: result.sentTo } : {}) },
        { status: 202 },
      );
    }
    if (!result.ok && result.ambiguous) {
      return NextResponse.json(
        { ok: true, delivery: "unconfirmed", ...(result.sentTo ? { sentTo: result.sentTo } : {}) },
      );
    }
    if (!result.ok) {
      if (result.skipped === "no_organizer_email") {
        return NextResponse.json(
          { error: "No organizer email on file. Add your email to the event or sign in with the account that created it." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: result.error || "Failed to send email", retryable: Boolean(result.retryable) },
        { status: result.retryable ? 503 : 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      delivery: "sent",
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
