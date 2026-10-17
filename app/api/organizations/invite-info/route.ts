import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { createHash } from "crypto";

function parseJsonBody(raw: string): { token?: unknown } | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as { token?: unknown };
  } catch {
    return null;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * POST /api/organizations/invite-info
 * 
 * Returns information about an invite without accepting it.
 * Used to display invite details on the landing page.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const body = parseJsonBody(raw);
    if (!body) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is not configured" },
        { status: 500 },
      );
    }

    const admin = createServiceRoleClient();
    const tokenHash = hashToken(token);

    // Get invite info using the RPC function
    const { data: invite, error: lookupErr } = await admin.rpc(
      "validate_and_get_invite",
      { p_token_hash: tokenHash },
    );

    if (lookupErr || !invite || (Array.isArray(invite) && invite.length === 0)) {
      // Check if it's an already-accepted or revoked invite for better error messages
      const { data: usedInvite } = await admin
        .from("organization_members")
        .select("status, token_expires_at")
        .eq("accept_token_hash", tokenHash)
        .maybeSingle();

      if (usedInvite) {
        if (usedInvite.status === "revoked") {
          return NextResponse.json({ error: "This invitation has been revoked" }, { status: 410 });
        }
        if (usedInvite.status === "accepted") {
          return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
        }
        if (usedInvite.token_expires_at && new Date(usedInvite.token_expires_at) < new Date()) {
          return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
        }
      }

      return NextResponse.json({ error: "Invitation not found or expired" }, { status: 404 });
    }

    const inviteData = Array.isArray(invite) ? invite[0] : invite;

    return NextResponse.json({
      organizationName: inviteData.organization_name,
      invitedEmail: inviteData.invited_email,
    });
  } catch (e) {
    console.error("POST /api/organizations/invite-info:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
