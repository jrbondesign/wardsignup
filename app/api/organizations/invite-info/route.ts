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

function isValidTokenFormat(token: string): boolean {
  // Tokens should be hex strings (32 bytes = 64 hex chars for new tokens)
  // But legacy tokens may vary, so just check for reasonable length and chars
  return /^[a-zA-Z0-9_-]{16,128}$/.test(token);
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
    if (!token || !isValidTokenFormat(token)) {
      return NextResponse.json({ error: "Invalid invite token format" }, { status: 400 });
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
      { p_token_hash: tokenHash } as never,
    );

    if (lookupErr || !invite || (Array.isArray(invite) && (invite as unknown[]).length === 0)) {
      // Check if it's an already-accepted or revoked invite for better error messages
      // Use separate queries to prevent filter injection
      let usedInvite = null;
      
      // Try by hash first
      const { data: byHash } = await admin
        .from("organization_members")
        .select("status, token_expires_at")
        .eq("accept_token_hash", tokenHash)
        .maybeSingle();
      
      if (byHash) {
        usedInvite = byHash;
      } else {
        // Try by plaintext for legacy tokens
        const { data: byPlaintext } = await admin
          .from("organization_members")
          .select("status, token_expires_at")
          .eq("accept_token", token)
          .maybeSingle();
        usedInvite = byPlaintext;
      }

      if (usedInvite) {
        if ((usedInvite as { status: string }).status === "revoked") {
          return NextResponse.json({ error: "This invitation has been revoked" }, { status: 410 });
        }
        if ((usedInvite as { status: string }).status === "accepted") {
          return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
        }
        const expiresAt = (usedInvite as { token_expires_at?: string }).token_expires_at;
        if (expiresAt && new Date(expiresAt) < new Date()) {
          return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
        }
      }

      return NextResponse.json({ error: "Invitation not found or expired" }, { status: 404 });
    }

    const inviteData = Array.isArray(invite) ? (invite as unknown[])[0] : invite;

    // Return only masked values (RPC function already masks them)
    return NextResponse.json({
      organizationName: (inviteData as { organization_name: string }).organization_name,
      maskedInvitedEmail: (inviteData as { masked_invited_email: string }).masked_invited_email,
      inviterDisplayName: (inviteData as { inviter_display_name?: string }).inviter_display_name || "",
    });
  } catch (e) {
    console.error("POST /api/organizations/invite-info:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
