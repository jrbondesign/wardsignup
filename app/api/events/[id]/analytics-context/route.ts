import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { analyticsContextForCampaign, type AnalyticsContext } from "@/lib/analytics-context";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public: the ward (organization) id for a sheet and whether it is a test ward,
 * so the public sheet page can tag its PostHog funnel events with org_id and
 * is_test_org. Org ids are not secret (they are already shipped in
 * NEXT_PUBLIC_* allowlists); only a boolean is returned for the test check, never
 * an email. Returns { orgId: null, isTestOrg: null } on any problem; the page
 * then sends events with nulls rather than failing.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ orgId: null, isTestOrg: null });
  let ctx: AnalyticsContext = { orgId: null, isTestOrg: null };
  try {
    ctx = await analyticsContextForCampaign(createServiceRoleClient(), id);
  } catch {
    ctx = { orgId: null, isTestOrg: null };
  }
  return NextResponse.json(
    { orgId: ctx.orgId, isTestOrg: ctx.isTestOrg },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
