import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * POST /api/organizations/[id]/transfer — owner promotes an existing accepted
 * co-admin to owner, demoting themselves to co-admin in one atomic RPC.
 */
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

    const body = await request.json().catch(() => ({}));
    const newOwnerMemberId =
      typeof body?.newOwnerMemberId === "string" ? body.newOwnerMemberId : "";
    if (!newOwnerMemberId) {
      return NextResponse.json({ error: "newOwnerMemberId is required" }, { status: 400 });
    }

    // Owner gate.
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id, owner_id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) {
      console.error("Transfer ownership: org lookup error:", orgErr);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    if (!orgRow) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if ((orgRow as { owner_id: string }).owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the owner can transfer ownership" },
        { status: 403 },
      );
    }

    // Resolve the target member row → user_id.
    const { data: memberRow, error: memberErr } = await supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role, status")
      .eq("id", newOwnerMemberId)
      .maybeSingle();
    if (memberErr) {
      console.error("Transfer ownership: member lookup error:", memberErr);
      return NextResponse.json({ error: "Failed to load member" }, { status: 500 });
    }
    const member = memberRow as
      | { id: string; organization_id: string; user_id: string | null; role: string; status: string }
      | null;
    if (!member || member.organization_id !== orgId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (member.status !== "accepted" || !member.user_id) {
      return NextResponse.json(
        { error: "The new owner must accept their invitation first" },
        { status: 400 },
      );
    }
    if (member.role === "owner") {
      return NextResponse.json({ error: "That user is already the owner" }, { status: 400 });
    }

    const { error: rpcErr } = await supabase.rpc("transfer_organization_ownership", {
      p_org_id: orgId,
      p_new_owner_user_id: member.user_id,
    } as never);
    if (rpcErr) {
      console.error("Transfer ownership: RPC error:", rpcErr);
      return NextResponse.json(
        { error: rpcErr.message ?? "Failed to transfer ownership" },
        { status: 500 },
      );
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_ownership_transferred",
      properties: {
        organization_id: orgId,
        new_owner_user_id: member.user_id,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/organizations/[id]/transfer:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
