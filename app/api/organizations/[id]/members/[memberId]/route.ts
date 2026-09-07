import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";

/** DELETE /api/organizations/[id]/members/[memberId] — revoke an invite or remove a co-admin. Owner only. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const { id: orgId, memberId } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id, owner_id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) {
      console.error("Revoke member: org lookup error:", orgErr);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    if (!orgRow) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if ((orgRow as { owner_id: string }).owner_id !== user.id) {
      return NextResponse.json({ error: "Only the owner can revoke members" }, { status: 403 });
    }

    const { data: memberRow, error: memberErr } = await supabase
      .from("organization_members")
      .select("id, role, organization_id")
      .eq("id", memberId)
      .maybeSingle();
    if (memberErr) {
      console.error("Revoke member: member lookup error:", memberErr);
      return NextResponse.json({ error: "Failed to load member" }, { status: 500 });
    }
    if (!memberRow || (memberRow as { organization_id: string }).organization_id !== orgId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if ((memberRow as { role: string }).role === "owner") {
      return NextResponse.json({ error: "Cannot remove the organization owner" }, { status: 400 });
    }

    const { error: deleteErr } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId);
    if (deleteErr) {
      console.error("Revoke member: delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to revoke member" }, { status: 500 });
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_member_revoked",
      properties: { organization_id: orgId, member_id: memberId },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/organizations/[id]/members/[memberId]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
