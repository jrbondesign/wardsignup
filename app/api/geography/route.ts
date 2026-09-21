import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isMetricsAdminEmail } from "@/lib/metrics-admin";
import { resolveGeographyPayload } from "@/lib/geography-cache";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser();

  if (authError || !user || !isMetricsAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await resolveGeographyPayload();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Geography admin API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch geography data" },
      { status: 500 },
    );
  }
}
