import { NextRequest, NextResponse, after } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { syncCampaignCalendar } from "@/lib/google-calendar-sync";
import { isGcalSyncFeatureEnabled } from "@/lib/gcal-feature";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth;
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Signup ID is required." }, { status: 400 });
  }

  const { data: signup, error: lookupError } = await supabase
    .from("signups")
    .select("id, campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) {
    console.error("admin/signups lookup:", lookupError);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }
  if (!signup) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("organization_id")
    .eq("id", (signup as { campaign_id: string }).campaign_id)
    .maybeSingle();
  if (campaignError) {
    console.error("admin/signups campaign:", campaignError);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }
  if (!campaign || !(await userCanAdminCampaign(supabase, user, campaign))) {
    return NextResponse.json({ error: "Not authorized to remove this signup." }, { status: 403 });
  }

  const campaignId = (signup as { campaign_id: string }).campaign_id;
  const { error } = await supabase.from("signups").delete().eq("id", id);

  if (error) {
    console.error("admin/signups delete:", error);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }

  // Sync to Google Calendar (fire-and-forget; never fails the delete)
  if (isGcalSyncFeatureEnabled()) {
    after(async () => {
      try {
        await syncCampaignCalendar(campaignId);
      } catch (e) {
        console.error("Calendar sync after admin signup delete:", e);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
