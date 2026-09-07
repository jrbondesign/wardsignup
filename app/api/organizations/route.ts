import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";
import { createOrganization, getCurrentOrganization } from "@/lib/organizations";

const MAX_NAME_LENGTH = 120;

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const brand = getBrandFromHost(host);
    const brandGate = await ensureOrganizerBrandMatchesHost(supabase, user.id, brand);
    if (!brandGate.ok) {
      return NextResponse.json({ error: brandGate.message }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";
    if (!rawName) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }
    if (rawName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Organization name must be ${MAX_NAME_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    const existing = await getCurrentOrganization(supabase, user, brand.id);
    if (existing) {
      return NextResponse.json(
        { error: "Organization already exists for this brand", organization: existing },
        { status: 409 },
      );
    }

    const org = await createOrganization(supabase, user, brand.id, rawName);
    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (error) {
    console.error("POST /api/organizations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
