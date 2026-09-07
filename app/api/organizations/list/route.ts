import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { listUserOrganizations } from "@/lib/organizations";

/** GET /api/organizations/list — every org the user can access on the current brand. */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const brand = getBrandFromHost(host);

  const orgs = await listUserOrganizations(auth.supabase, auth.user, brand.id);

  const { data: profile } = await auth.supabase
    .from("organizer_profiles")
    .select("selected_org_id")
    .eq("user_id", auth.user.id)
    .eq("brand_id", brand.id)
    .maybeSingle();
  const selectedOrgId = (profile as { selected_org_id: string | null } | null)?.selected_org_id ?? null;

  return NextResponse.json({ organizations: orgs, selectedOrgId }, { status: 200 });
}
