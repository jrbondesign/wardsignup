import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";

/** POST /api/organizations/[id]/leave — co-admin removes themselves. Owners must transfer first. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orgId } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id, owner_id, brand_id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) {
      console.error("Leave org: lookup error:", orgErr);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    const org = orgRow as { id: string; owner_id: string; brand_id: string } | null;
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (org.owner_id === user.id) {
      return NextResponse.json(
        { error: "Owners cannot leave. Transfer ownership first." },
        { status: 403 },
      );
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id, role, status")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    const m = membership as { id: string; role: string; status: string } | null;
    if (!m || m.status !== "accepted") {
      return NextResponse.json({ error: "You are not a member of this organization" }, { status: 403 });
    }

    // Hard-delete to mirror the owner's revoke flow (members route DELETE), keeping
    // the model consistent: a member is either present or gone.
    const { error: deleteErr } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", m.id);
    if (deleteErr) {
      console.error("Leave org: delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to leave organization" }, { status: 500 });
    }

    // Clear the saved selection if it pointed at this org so the next page load falls
    // through to default-selection logic instead of looping back here.
    await supabase
      .from("organizer_profiles")
      .update({ selected_org_id: null } as never)
      .eq("user_id", user.id)
      .eq("brand_id", org.brand_id)
      .eq("selected_org_id", orgId);

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_member_left",
      properties: { organization_id: orgId, brand_id: org.brand_id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/organizations/[id]/leave:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
