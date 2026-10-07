import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAdminCampaign } from "@/lib/campaign-access";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { publicCoverForCampaign } from "@/lib/event-media";
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";
import { isValidCoverPosition } from "@/lib/cover-position";
import type { Campaign } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public: cover URL + focal point, or nulls when hidden by the cover feature flag. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ coverUrl: null, coverPosition: null });
  const cover = await publicCoverForCampaign(createServiceRoleClient(), id);
  return NextResponse.json({
    coverUrl: cover?.url ?? null,
    coverPosition: cover?.position ?? null,
  });
}

/** Save the cover focal point ({ position: "<x>% <y>%" }). Event admins only. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const auth = await getAuthFromRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => null)) as { position?: unknown } | null;
  if (!isValidCoverPosition(body?.position)) {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: event } = await admin
    .from("campaigns")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!(await userCanAdminCampaign(supabase, user, event as Pick<Campaign, "organization_id">))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isCoverImageEnabledForOrg((event as { organization_id: string | null }).organization_id)) {
    return NextResponse.json({ error: "Cover images aren't available yet" }, { status: 403 });
  }

  const { error } = await admin
    .from("campaigns")
    .update({ cover_position: body!.position } as never)
    .eq("id", id);
  if (error) {
    console.error("cover_position update error:", error);
    return NextResponse.json({ error: "Failed to save position" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
