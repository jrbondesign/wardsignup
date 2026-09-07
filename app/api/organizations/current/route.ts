import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { getCurrentOrganization } from "@/lib/organizations";

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const brand = getBrandFromHost(host);

  const org = await getCurrentOrganization(auth.supabase, auth.user, brand.id);
  if (!org) {
    return NextResponse.json({ organization: null }, { status: 200 });
  }
  return NextResponse.json({ organization: org }, { status: 200 });
}
