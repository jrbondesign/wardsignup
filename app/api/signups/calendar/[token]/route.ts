import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand";
import { buildEventIcs, icsFilenameForCampaign, type IcsSession } from "@/lib/ics";

// Returns a text/calendar (.ics) file containing every slot the participant
// signed up for in this event. Used by the batch confirmation email so a
// single "Apple / Outlook" link in the email imports every slot at once.

type SessionLite = IcsSession;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || !/^[0-9a-f-]{8,}$/i.test(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createServiceRoleClient();

  // Find the signup the token belongs to so we know the campaign + member.
  const { data: anchor, error: anchorErr } = await admin
    .from("signups")
    .select("campaign_id, member_email")
    .eq("cancel_token", token)
    .maybeSingle();

  if (anchorErr) {
    console.error("calendar/[token] anchor:", anchorErr);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
  if (!anchor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const anchorRow = anchor as { campaign_id: string; member_email: string | null };

  // Pull the campaign once (for name/timezone/end_date/url).
  const { data: campaignRaw, error: campErr } = await admin
    .from("campaigns")
    .select("id, name, brand_id, public_host, event_timezone, event_end_date")
    .eq("id", anchorRow.campaign_id)
    .single();
  if (campErr || !campaignRaw) {
    console.error("calendar/[token] campaign:", campErr);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const campaign = campaignRaw as {
    id: string;
    name: string;
    brand_id: string | null;
    public_host: string | null;
    event_timezone: string | null;
    event_end_date: string | null;
  };

  // Pull every slot this member has in this campaign (joined to sessions).
  // If the signup has no email, fall back to the single anchor signup.
  let signupsQuery = admin
    .from("signups")
    .select("sessions ( time, end_time, session_date )")
    .eq("campaign_id", anchorRow.campaign_id);
  signupsQuery = anchorRow.member_email
    ? signupsQuery.eq("member_email", anchorRow.member_email)
    : signupsQuery.eq("cancel_token", token);

  const { data: signupRows, error: signupsErr } = await signupsQuery;
  if (signupsErr) {
    console.error("calendar/[token] signups:", signupsErr);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }

  const sessions: SessionLite[] = ((signupRows ?? []) as Array<{ sessions: SessionLite | SessionLite[] | null }>)
    .map((r) => (Array.isArray(r.sessions) ? r.sessions[0] : r.sessions))
    .filter((s): s is SessionLite => Boolean(s && s.session_date && s.time));

  if (sessions.length === 0) {
    return NextResponse.json({ error: "no_dated_slots" }, { status: 404 });
  }

  const { siteOrigin } = publicSiteOriginAndBrandForCampaign(campaign);
  const eventUrl = `${siteOrigin}/event/${campaign.id}`;

  const ics = buildEventIcs({
    sessions,
    campaignName: campaign.name,
    eventUrl,
    timezone: campaign.event_timezone,
    campaignEventEndDate: campaign.event_end_date,
    campaignId: campaign.id,
  });
  if (!ics) {
    return NextResponse.json({ error: "no_dated_slots" }, { status: 404 });
  }

  const filename = icsFilenameForCampaign(campaign.name);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
