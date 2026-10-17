import { type NextRequest, NextResponse } from "next/server";
import {
  isKnownBrandHost,
  normalizeHost,
  preferredBrandApexHost,
} from "@/lib/brand";
import { isProtectedPath, updateSession } from "@/lib/supabase/middleware";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value);
  });
}

function shouldSkipCanonicalRedirect(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.startsWith("127.")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return isKnownBrandHost(h);
}

export async function middleware(request: NextRequest) {
  // Preview only review demo: no session refresh, no auth, no redirects.
  if (request.nextUrl.pathname.startsWith("/demo/")) {
    return NextResponse.next();
  }
  const currentHost = normalizeHost(request.nextUrl.host);

  // Preferred host: www → apex for each brand (301). Keeps multi-brand apexes
  // intact while consolidating www aliases for SEO/GSC.
  const preferredApex = preferredBrandApexHost(currentHost);
  if (preferredApex) {
    const dest = request.nextUrl.clone();
    dest.protocol = "https:";
    dest.host = preferredApex;
    dest.port = "";
    return NextResponse.redirect(dest, 301);
  }

  const canonical =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  if (canonical) {
    try {
      const canonicalUrl = new URL(canonical);
      const canonicalHost = canonicalUrl.host.toLowerCase();
      if (
        canonicalHost &&
        currentHost !== canonicalHost &&
        !shouldSkipCanonicalRedirect(currentHost)
      ) {
        const dest = new URL(canonicalUrl.toString());
        dest.pathname = request.nextUrl.pathname;
        dest.search = request.nextUrl.search;
        return NextResponse.redirect(dest);
      }
    } catch {
      // ignore invalid env value
    }
  }

  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/")) {
    return response;
  }

  if (isProtectedPath(path) && !user) {
    // Validate next param: must be relative, single leading /, no //, no scheme/backslash
    const fullPath = `${path}${request.nextUrl.search}`;
    let validNext = fullPath;
    
    if (!fullPath.startsWith("/") || fullPath.startsWith("//") || fullPath.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(fullPath)) {
      validNext = path; // Strip invalid query
    }
    
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", validNext);
    const redirect = NextResponse.redirect(loginUrl);
    copyCookies(response, redirect);
    return redirect;
  }

  if (path === "/login" && user) {
    // Preserve next param for validated paths (e.g., invite acceptance flow)
    const nextParam = request.nextUrl.searchParams.get("next");
    const validNext = nextParam?.startsWith("/orgs/accept") ? nextParam : null;
    
    if (validNext) {
      // User is signed in and has a valid next destination
      const dest = request.nextUrl.clone();
      dest.pathname = validNext.split("?")[0];
      dest.search = validNext.includes("?") ? validNext.split("?")[1] : "";
      const redirect = NextResponse.redirect(dest);
      copyCookies(response, redirect);
      return redirect;
    }
    
    // Default: redirect to dashboard
    const dash = request.nextUrl.clone();
    dash.pathname = "/dashboard";
    dash.search = "";
    const redirect = NextResponse.redirect(dash);
    copyCookies(response, redirect);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
