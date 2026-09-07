import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";

const MAX_NAME_LENGTH = 120;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;

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

    // RLS restricts UPDATE to owner_id = auth.uid(); double-check explicitly so we
    // can return a clearer error if the row exists but isn't owned by this user.
    const { data: existing, error: lookupError } = await supabase
      .from("organizations")
      .select("id, owner_id")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) {
      console.error("PATCH /api/organizations lookup error:", lookupError);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if ((existing as { owner_id: string }).owner_id !== user.id) {
      return NextResponse.json({ error: "Only the owner can rename this organization" }, { status: 403 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("organizations")
      .update({ name: rawName, needs_naming: false } as never)
      .eq("id", id)
      .select("id, name, needs_naming, brand_id")
      .single();
    if (updateError || !updated) {
      console.error("PATCH /api/organizations update error:", updateError);
      return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }

    return NextResponse.json({ organization: updated }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/organizations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
