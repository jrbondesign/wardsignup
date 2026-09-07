import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server-side PKCE / magic-link completion. The browser sends cookies set by
 * createBrowserClient (code verifier + chunks); exchangeCodeForSession must run
 * where those cookies are visible — a same-origin fetch from /auth/callback is reliable.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  let response = NextResponse.json({ ok: true as const });

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
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as never);
          });
        },
      },
    },
  );

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.json(
          { ok: false as const, message: error.message },
          { status: 400 },
        );
      }
    } else if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as "email" | "signup" | "recovery" | "email_change" | "magiclink",
      });
      if (error) {
        return NextResponse.json(
          { ok: false as const, message: error.message },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { ok: false as const, message: "Missing auth parameters" },
        { status: 400 },
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Authentication failed";
    return NextResponse.json({ ok: false as const, message }, { status: 500 });
  }

  return response;
}
