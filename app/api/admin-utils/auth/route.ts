import { NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { isMetricsAdminEmail } from "@/lib/metrics-admin";

/** Verifies Bearer JWT and metrics-admin allowlist (same as /api/metrics). */
export async function GET(request: Request) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false }, { status: auth.status });
  }
  if (!isMetricsAdminEmail(auth.user.email)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
