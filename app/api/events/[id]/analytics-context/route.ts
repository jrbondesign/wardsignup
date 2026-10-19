import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { orgIdForCampaign } from "@/lib/analytics-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: the ward (organization) id for a sheet, so the public sheet page can
 * tag its PostHog funnel events with org_id. Org ids are not secret (they are
 * already shipped in NEXT_PUBLIC_* allowlists). Returns { orgId: null } on any
 * problem; the page then sends events without an org id rather than failing.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ orgId: null });
  let orgId: string | null = null;
  try {
    orgId = await orgIdForCampaign(createServiceRoleClient(), id);
  } catch {
    orgId = null;
  }
  return NextResponse.json(
    { orgId },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
