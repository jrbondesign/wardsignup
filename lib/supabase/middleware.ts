import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types";

export function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname === "/create") return true;
  if (pathname.startsWith("/setup/")) return true;
  if (pathname.startsWith("/edit/")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/admin-utils")) return true;
  return false;
}

/** Longest the middleware waits on Supabase auth before letting the request through. */
export const AUTH_TIMEOUT_MS = 5000;

/** True when the request carries a Supabase auth cookie (sb-<ref>-auth-token, possibly chunked). */
export function hasAuthCookie(cookies: { name: string }[]): boolean {
  return cookies.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
  );
}

/** The signed-in user as far as middleware needs to know: verified JWT subject and email. */
export interface MiddlewareUser {
  id: string;
  email?: string;
}

/** Turn verified JWT claims into the middleware user; null when there is no usable subject. */
export function userFromClaims(claims: { sub?: unknown; email?: unknown } | null | undefined): MiddlewareUser | null {
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}

/**
 * Refreshes the Supabase session from cookies and returns the response that
 * must be used so Set-Cookie headers are applied (per @supabase/ssr).
 *
 * Uses auth.getClaims(), not getUser(): the project signs JWTs with an
 * asymmetric key (ES256), so the token is verified locally against the cached
 * JWKS instead of a /auth/v1/user round trip on every page view. An expiring
 * session is still refreshed (getClaims refreshes first) and its cookies set.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: MiddlewareUser | null;
  /** Supabase did not answer within AUTH_TIMEOUT_MS; user is unknown, not signed out. */
  timedOut: boolean;
}> {
  // Anonymous visitors have no session to refresh; skip the Supabase round trip.
  if (!hasAuthCookie(request.cookies.getAll())) {
    return { response: NextResponse.next({ request }), user: null, timedOut: false };
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), AUTH_TIMEOUT_MS);
  });
  const result = await Promise.race([
    supabase.auth.getClaims().catch(() => null),
    timeout,
  ]);
  clearTimeout(timer);

  if (result === "timeout") {
    console.error(`middleware: Supabase auth did not respond within ${AUTH_TIMEOUT_MS}ms`);
    return { response: NextResponse.next({ request }), user: null, timedOut: true };
  }

  return { response: supabaseResponse, user: userFromClaims(result?.data?.claims), timedOut: false };
}
