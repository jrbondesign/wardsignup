import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";

const MAX_SLUG_LENGTH = 60;
const SLUG_REGEX = /^[a-z0-9-]+$/;

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
    const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : null;
    const publicDirectoryEnabled = Boolean(body?.public_directory_enabled);

    // Validate slug format if provided
    if (slug) {
      if (slug.length > MAX_SLUG_LENGTH) {
        return NextResponse.json(
          { error: `Slug must be ${MAX_SLUG_LENGTH} characters or fewer` },
          { status: 400 },
        );
      }
      if (!SLUG_REGEX.test(slug)) {
        return NextResponse.json(
          { error: "Slug can only contain lowercase letters, numbers, and hyphens" },
          { status: 400 },
        );
      }
    }

    // Accepted members (including the owner) may update slug / publish.
    // RLS + restrict_org_member_updates keep other org columns owner-only.
    const { data: existing, error: lookupError } = await supabase
      .from("organizations")
      .select("id, owner_id, slug")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) {
      console.error("PATCH /api/organizations/directory lookup error:", lookupError);
      return NextResponse.json({ error: "Failed to load organization" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", id)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!membership && (existing as { owner_id: string }).owner_id !== user.id) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    // Check slug uniqueness if changing
    const existingSlug = (existing as { slug: string | null }).slug;
    if (slug && slug !== existingSlug) {
      const { data: collision } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .neq("id", id)
        .maybeSingle();
      if (collision) {
        // Slug is taken; suggest an opaque alternative
        const suffix = id.substring(0, 8);
        const suggested = `${slug}-${suffix}`;
        return NextResponse.json(
          { error: `Slug "${slug}" is already taken. Try "${suggested}" instead.` },
          { status: 409 },
        );
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("organizations")
      .update({ slug, public_directory_enabled: publicDirectoryEnabled } as never)
      .eq("id", id)
      .select("id, slug, public_directory_enabled")
      .single();
    if (updateError || !updated) {
      console.error("PATCH /api/organizations/directory update error:", updateError);
      return NextResponse.json({ error: "Failed to update directory settings" }, { status: 500 });
    }

    return NextResponse.json({ organization: updated }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/organizations/directory error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
