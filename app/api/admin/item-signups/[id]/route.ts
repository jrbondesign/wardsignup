import { NextRequest, NextResponse, after } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";

/**
 * DELETE /api/admin/item-signups/[id]
 * 
 * Remove an item signup. Mirrors the spots signup delete route exactly:
 * - Uses user session auth (not service role)
 * - Checks org membership via userCanAdminCampaign
 * - No calendar sync (items events don't sync to calendar)
 */
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
    return NextResponse.json({ error: "Item signup ID is required." }, { status: 400 });
  }

  // Lookup the item signup to get campaign_id
  const { data: itemSignup, error: lookupError } = await supabase
    .from("item_signups")
    .select("id, campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) {
    console.error("admin/item-signups lookup:", lookupError);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }
  if (!itemSignup) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  // Check org membership authorization
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("organization_id")
    .eq("id", (itemSignup as { campaign_id: string }).campaign_id)
    .maybeSingle();
  if (campaignError) {
    console.error("admin/item-signups campaign:", campaignError);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }
  if (!campaign || !(await userCanAdminCampaign(supabase, user, campaign))) {
    return NextResponse.json({ error: "Not authorized to remove this signup." }, { status: 403 });
  }

  // Delete the item signup (RLS policy checks org membership)
  const { error } = await supabase.from("item_signups").delete().eq("id", id);

  if (error) {
    console.error("admin/item-signups delete:", error);
    return NextResponse.json({ error: "Failed to remove signup." }, { status: 500 });
  }

  // Note: No Google Calendar sync for items events (they don't have time slots)
  // If we add calendar support for items events in the future, add sync here like spots route

  return NextResponse.json({ ok: true });
}
