import { NextRequest, NextResponse } from "next/server";
import { publicSiteOriginFromRequest } from "@/lib/brand/request-origin";

export const dynamic = "force-dynamic";

/**
 * Returns the Google OAuth `redirectTo` using the **incoming request host** (x-forwarded-host),
 * not only `window.location.origin`. Do **not** append `?next=` here: Supabase matches the full
 * `redirectTo` against Redirect URLs, and a query string can fail to match a bare `/auth/callback`
 * entry (users then land on Site URL, often wardsignup.com). Post-auth navigation uses
 * sessionStorage (`AUTH_RETURN_STORAGE_KEY`) set on /login.
 */
export async function GET(request: NextRequest) {
  const origin = publicSiteOriginFromRequest(request);
  const redirectTo = `${origin.replace(/\/$/, "")}/auth/callback`;
  return NextResponse.json({ redirectTo });
}
