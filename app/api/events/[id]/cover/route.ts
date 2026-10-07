import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { publicCoverUrlForCampaign } from "@/lib/event-media";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public: cover URL for an event, or null when hidden by the cover feature flag. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ coverUrl: null });
  const coverUrl = await publicCoverUrlForCampaign(createServiceRoleClient(), id);
  return NextResponse.json({ coverUrl });
}
