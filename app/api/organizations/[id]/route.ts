import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { isMissingColumnError } from "@/lib/missing-column";
import { WARD_NAME_MAX_LENGTH, normalizeWardName } from "@/lib/ward-name";
import { userIsAcceptedOrgMember } from "@/lib/campaign-access";

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

    // Optional Ward/Unit name (organizations.ward_name). Only touched when the key is
    // sent; null or "" clears it.
    const hasWard = body && typeof body === "object" && "ward_name" in body;
    const rawWard = hasWard ? (body as { ward_name?: unknown }).ward_name : undefined;
    if (hasWard && rawWard !== null && typeof rawWard !== "string") {
      return NextResponse.json({ error: "Ward/Unit must be text" }, { status: 400 });
    }
    const wardName = hasWard ? normalizeWardName(rawWard) : null;
    if (wardName && wardName.length > WARD_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Ward/Unit must be ${WARD_NAME_MAX_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    // Owner and accepted co-admins may change the org name and Ward/Unit. This
    // route only ever writes name, needs_naming and ward_name, so co-admins can't
    // reach owner only columns (owner_id, slug, brand_id) through it. In the
    // database, the restrict_org_member_updates trigger enforces the same column
    // list for co-admins (migration 20261026190000_coadmins_edit_org_identity.sql).
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
    const isOwner = (existing as { owner_id: string }).owner_id === user.id;
    if (!isOwner && !(await userIsAcceptedOrgMember(supabase, user, id))) {
      return NextResponse.json({ error: "Only admins of this organization can rename it" }, { status: 403 });
    }

    const runUpdate = (withWard: boolean) =>
      supabase
        .from("organizations")
        .update(
          (withWard
            ? { name: rawName, needs_naming: false, ward_name: wardName }
            : { name: rawName, needs_naming: false }) as never,
        )
        .eq("id", id)
        .select(withWard ? "id, name, needs_naming, brand_id, ward_name" : "id, name, needs_naming, brand_id")
        .single();

    let wardSaved = hasWard;
    let { data: updated, error: updateError } = await runUpdate(hasWard);
    if (hasWard && updateError && isMissingColumnError(updateError, "ward_name")) {
      // ward_name migration not applied yet: save the name anyway so setup completes.
      console.warn("PATCH /api/organizations: ward_name column missing; saved name only");
      wardSaved = false;
      ({ data: updated, error: updateError } = await runUpdate(false));
    }
    if (!isOwner && updateError && (updateError as { code?: string }).code === "42501") {
      // Co-admin edit migration not applied yet: the old trigger allows directory fields only.
      return NextResponse.json(
        {
          error: "Co-admins can't change these yet. Please ask the owner, or try again later.",
          code: "coadmin_edit_unavailable",
        },
        { status: 409 },
      );
    }
    if (updateError || !updated) {
      console.error("PATCH /api/organizations update error:", updateError);
      return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
    }

    return NextResponse.json(
      hasWard ? { organization: updated, wardSaved } : { organization: updated },
      { status: 200 },
    );
  } catch (error) {
    console.error("PATCH /api/organizations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
