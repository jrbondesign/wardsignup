import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBrandFromHost } from "@/lib/brand";
import { ensureOrganizerBrandMatchesHost } from "@/lib/organizer-profile";
import { CALLING_MAX_LENGTH, normalizeCalling } from "@/lib/callings";

/** Postgres "undefined_column": the calling migration has not run on this database yet. */
function isMissingColumn(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42703";
}

function brandFor(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return getBrandFromHost(host);
}

/** GET the signed in creator's calling for this site. */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth;
  const brand = brandFor(request);

  const { data, error } = await supabase
    .from("organizer_profiles")
    .select("calling")
    .eq("user_id", user.id)
    .eq("brand_id", brand.id)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return NextResponse.json({ calling: null }, { status: 200 });
    console.error("GET /api/organizer-profile/calling error:", error);
    return NextResponse.json({ error: "Failed to load your calling" }, { status: 500 });
  }
  return NextResponse.json({ calling: (data as { calling?: string | null } | null)?.calling ?? null });
}

/** PATCH { calling: string | null }. Empty or null clears it. Own row only (RLS). */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }
    const { supabase, user } = auth;
    const brand = brandFor(request);

    const body = await request.json().catch(() => ({}));
    const raw = body?.calling;
    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return NextResponse.json({ error: "Calling must be text" }, { status: 400 });
    }
    if (typeof raw === "string" && raw.trim().length > CALLING_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Calling must be ${CALLING_MAX_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }
    const calling = normalizeCalling(raw);

    // Creates the (user, brand) profile row on first use, same as org creation does.
    const gate = await ensureOrganizerBrandMatchesHost(supabase, user.id, brand);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: 403 });
    }

    const { error } = await supabase
      .from("organizer_profiles")
      .update({ calling, calling_updated_at: new Date().toISOString() } as never)
      .eq("user_id", user.id)
      .eq("brand_id", brand.id);
    if (error) {
      if (isMissingColumn(error)) {
        return NextResponse.json(
          { error: "Saving your calling isn't available yet. Please try again later." },
          { status: 503 },
        );
      }
      console.error("PATCH /api/organizer-profile/calling error:", error);
      return NextResponse.json({ error: "Failed to save your calling" }, { status: 500 });
    }
    return NextResponse.json({ calling }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/organizer-profile/calling error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
