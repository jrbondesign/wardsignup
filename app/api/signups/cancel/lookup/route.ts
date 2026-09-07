import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { formatSessionSlotLabel } from "@/lib/organizer-email";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const admin = createServiceRoleClient();

  type LookupRow = {
    member_name: string;
    guest_names: string[];
    sessions: { day_of_week: number; time: string; end_time: string | null; session_date: string | null } | { day_of_week: number; time: string; end_time: string | null; session_date: string | null }[] | null;
    campaigns: { id: string; name: string; brand_id: string | null; public_host: string | null; event_timezone: string | null; event_end_date: string | null } | { id: string; name: string; brand_id: string | null; public_host: string | null; event_timezone: string | null; event_end_date: string | null }[] | null;
  };

  const { data: rawData, error } = await admin
    .from("signups")
    .select(
      `
      member_name,
      guest_names,
      sessions (
        day_of_week,
        time,
        end_time,
        session_date
      ),
      campaigns (
        id,
        name,
        brand_id,
        public_host,
        event_timezone,
        event_end_date
      )
    `,
    )
    .eq("cancel_token", token)
    .maybeSingle();

  if (error) {
    console.error("cancel/lookup:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  if (!rawData) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const data = rawData as unknown as LookupRow;

  const session = Array.isArray(data.sessions) ? data.sessions[0] : data.sessions;
  const campaign = Array.isArray(data.campaigns) ? data.campaigns[0] : data.campaigns;

  if (!session || !campaign) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const slotLabel = formatSessionSlotLabel(session as Parameters<typeof formatSessionSlotLabel>[0], {
    eventTimezone: (campaign as { event_timezone?: string | null }).event_timezone ?? null,
  });

  const { siteOrigin } = publicSiteOriginAndBrandForCampaign(
    campaign as Parameters<typeof publicSiteOriginAndBrandForCampaign>[0],
  );

  const sess = session as { day_of_week: number; time: string; end_time: string | null; session_date: string | null };
  const camp = campaign as { id: string; name: string; event_timezone?: string | null; event_end_date?: string | null };

  return NextResponse.json({
    member_name: data.member_name,
    guest_names: Array.isArray(data.guest_names) ? data.guest_names : [],
    campaign_name: camp.name,
    slot_label: slotLabel,
    event_url: `${siteOrigin}/event/${camp.id}`,
    // Structured date/time for calendar links (null when no specific date)
    session_date: sess.session_date ?? null,
    session_time: sess.time ?? null,
    session_end_time: sess.end_time ?? null,
    event_timezone: camp.event_timezone ?? null,
    event_end_date: camp.event_end_date ?? null,
  });
}
