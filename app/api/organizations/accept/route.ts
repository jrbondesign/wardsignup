import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getPostHogClient } from "@/lib/posthog-server";

/** POST /api/organizations/accept { token } — claim a co-admin invitation. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { user } = auth;

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) {
      return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is not configured to accept invites" },
        { status: 500 },
      );
    }
    const admin = createServiceRoleClient();

    const { data: row, error: lookupErr } = await admin
      .from("organization_members")
      .select("id, organization_id, invited_email, status, token_expires_at, transfer_on_accept")
      .eq("accept_token", token)
      .maybeSingle();
    if (lookupErr) {
      console.error("Accept invite: lookup error:", lookupErr);
      return NextResponse.json({ error: "Failed to look up invitation" }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const member = row as {
      id: string;
      organization_id: string;
      invited_email: string;
      status: string;
      token_expires_at: string | null;
      transfer_on_accept: boolean;
    };
    if (member.status !== "pending") {
      return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
    }
    if (member.token_expires_at && new Date(member.token_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }
    if ((user.email ?? "").toLowerCase() !== member.invited_email.toLowerCase()) {
      return NextResponse.json(
        { error: "Sign in with the invited email address to accept this invitation." },
        { status: 403 },
      );
    }

    const { error: updateErr } = await admin
      .from("organization_members")
      .update({
        user_id: user.id,
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accept_token: null,
        token_expires_at: null,
      } as never)
      .eq("id", member.id);
    if (updateErr) {
      console.error("Accept invite: update error:", updateErr);
      return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
    }

    // Handoff invite: promote the new member to owner and demote the previous owner
    // to admin in one atomic RPC. If this fails, the invitee is still a regular admin
    // — we surface the error but don't roll back the acceptance.
    let ownershipTransferred = false;
    if (member.transfer_on_accept) {
      const { error: transferErr } = await admin.rpc("transfer_organization_ownership", {
        p_org_id: member.organization_id,
        p_new_owner_user_id: user.id,
      } as never);
      if (transferErr) {
        console.error("Accept invite: ownership transfer error:", transferErr);
        return NextResponse.json(
          {
            organization_id: member.organization_id,
            error:
              "Invitation accepted, but ownership could not be transferred automatically. Ask the previous owner to retry from organization settings.",
          },
          { status: 500 },
        );
      }
      ownershipTransferred = true;
    }

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_member_accepted",
      properties: {
        organization_id: member.organization_id,
        ownership_transferred: ownershipTransferred,
      },
    });

    return NextResponse.json(
      { organization_id: member.organization_id, ownership_transferred: ownershipTransferred },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/organizations/accept:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
