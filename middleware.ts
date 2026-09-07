import { type NextRequest, NextResponse } from "next/server";
import { isKnownBrandHost, normalizeHost } from "@/lib/brand";
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
  const canonical =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  if (canonical) {
    try {
      const canonicalUrl = new URL(canonical);
      const currentHost = normalizeHost(request.nextUrl.host);
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
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(loginUrl);
    copyCookies(response, redirect);
    return redirect;
  }

  if (path === "/login" && user) {
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
