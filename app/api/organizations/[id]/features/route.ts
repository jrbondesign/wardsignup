import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userIsAcceptedOrgMember } from "@/lib/campaign-access";
import { isCoverImageEnabledForOrgOrFlag, isGcalSyncEnabledForOrgOrFlag } from "@/lib/org-feature-gates";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OFF = { gcalSync: false, coverImages: false };

/**
 * GET /api/organizations/[id]/features: feature gates for an org the caller
 * belongs to (allowlist OR PostHog flag; fails closed). The client combines
 * this with its own allowlist check (lib/use-org-features.ts).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId)) return NextResponse.json(OFF, { status: 404 });
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
    const { supabase, user } = auth;
    if (!(await userIsAcceptedOrgMember(supabase, user, orgId))) {
      return NextResponse.json(OFF, { status: 403 });
    }
    const [gcalSync, coverImages] = await Promise.all([
      isGcalSyncEnabledForOrgOrFlag(orgId).catch(() => false),
      isCoverImageEnabledForOrgOrFlag(orgId).catch(() => false),
    ]);
    return NextResponse.json(
      { gcalSync, coverImages },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    console.error("GET /api/organizations/[id]/features:", e);
    return NextResponse.json(OFF, { status: 500 });
  }
}
