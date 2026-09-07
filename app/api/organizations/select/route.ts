import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { setSelectedOrganization } from "@/lib/organizations";
import { getPostHogClient } from "@/lib/posthog-server";

/** POST /api/organizations/select — set the user's active org for the current brand. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const body = await request.json().catch(() => ({}));
    const orgId = typeof body?.organizationId === "string" ? body.organizationId : null;
    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);

    // Verify the user is an accepted member of the org AND the org belongs to this brand.
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("id, brand_id")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) {
      console.error("Select org: org lookup error:", orgErr);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    const org = orgRow as { id: string; brand_id: string } | null;
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (org.brand_id !== brand.id) {
      return NextResponse.json({ error: "Organization belongs to a different brand" }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: "You are not a member of this organization" }, { status: 403 });
    }

    await setSelectedOrganization(supabase, user, brand.id, orgId);

    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "org_selected",
      properties: { organization_id: orgId, brand_id: brand.id },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/organizations/select:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
