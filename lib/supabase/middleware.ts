import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
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

/**
 * Refreshes the Supabase session from cookies and returns the response that
 * must be used so Set-Cookie headers are applied (per @supabase/ssr).
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: User | null;
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
    supabase.auth.getUser().catch(() => null),
    timeout,
  ]);
  clearTimeout(timer);

  if (result === "timeout") {
    console.error(`middleware: Supabase auth did not respond within ${AUTH_TIMEOUT_MS}ms`);
    return { response: NextResponse.next({ request }), user: null, timedOut: true };
  }

  return { response: supabaseResponse, user: result?.data.user ?? null, timedOut: false };
}
