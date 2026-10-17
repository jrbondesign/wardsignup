import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { getPostHogClient } from "@/lib/posthog-server";
import { consumeActionRate } from "@/lib/rate-limit";
import { createHash } from "crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** POST /api/organizations/accept { token } — claim a co-admin invitation. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { user } = auth;

    // Rate limit: per IP
    const rate = await consumeActionRate("accept_invite", request, 10);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

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
    const tokenHash = hashToken(token);

    // Use the transactional RPC function for secure acceptance
    // RPC reads user_id and email from auth.uid() and auth.users for security
    const { data: result, error: acceptErr } = await admin.rpc(
      "accept_organization_invite",
      { p_token_hash: tokenHash } as never,
    );

    if (acceptErr) {
      console.error("Accept invite error:", acceptErr);
      
      // Handle specific error codes
      if (acceptErr.code === "P0002") {
        return NextResponse.json({ error: "Invitation not found or expired" }, { status: 404 });
      }
      if (acceptErr.code === "42501") {
        return NextResponse.json(
          { error: "Sign in with the invited email address to accept this invitation." },
          { status: 403 },
        );
      }

      return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
    }

    if (!result || (Array.isArray(result) && (result as unknown[]).length === 0)) {
      return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
    }

    const resultData = Array.isArray(result) ? (result as unknown[])[0] : result;
    const organizationId = (resultData as { organization_id: string }).organization_id;
    const organizationName = (resultData as { organization_name: string }).organization_name;
    const ownershipTransferred = (resultData as { ownership_transferred: boolean }).ownership_transferred;
    const alreadyMember = (resultData as { already_member: boolean }).already_member;

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_member_accepted",
      properties: {
        organization_id: organizationId,
        ownership_transferred: ownershipTransferred,
        already_member: alreadyMember,
      },
    });

    // Determine where to send the user after acceptance:
    // 1. If exactly one active campaign, go to its admin page
    // 2. Otherwise, go to dashboard filtered by this org
    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(2);

    let destination = "/dashboard";
    if (campaigns && Array.isArray(campaigns) && campaigns.length === 1) {
      destination = `/admin/${(campaigns[0] as { id: string }).id}`;
    } else if (campaigns && Array.isArray(campaigns) && campaigns.length > 0) {
      destination = `/dashboard?org=${organizationId}`;
    }

    return NextResponse.json(
      {
        organization_id: organizationId,
        organization_name: organizationName,
        ownership_transferred: ownershipTransferred,
        destination,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("POST /api/organizations/accept:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
