import { NextRequest, NextResponse } from "next/server";
import { trustedAuthOriginFromRequest } from "@/lib/brand/request-origin";

export const dynamic = "force-dynamic";

/**
 * Returns the Google OAuth `redirectTo` using an allowlisted brand/loopback origin,
 * not only `window.location.origin`. Do **not** append `?next=` here: Supabase matches the full
 * `redirectTo` against Redirect URLs, and a query string can fail to match a bare `/auth/callback`
 * entry (users then land on Site URL, often wardsignup.com). Post-auth navigation uses
 * sessionStorage (`AUTH_RETURN_STORAGE_KEY`) set on /login.
 */
export async function GET(request: NextRequest) {
  const origin = trustedAuthOriginFromRequest(request);
  if (!origin) {
    return NextResponse.json({ error: "Unknown host" }, { status: 400 });
  }
  const redirectTo = `${origin.replace(/\/$/, "")}/auth/callback`;
  return NextResponse.json({ redirectTo });
}
