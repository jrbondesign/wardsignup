import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { AUTH_RETURN_STORAGE_KEY, safeReturnPath } from "./auth-return-path";
import { posthogDistinctIdHeader } from "./posthog-client";
import type { AuthError } from "@supabase/supabase-js";
import { Database } from "./types";
import { createServiceRoleClient } from "./supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser client: @supabase/ssr stores the session in cookies (PKCE + refresh in middleware).
 * Do not call from server render paths that trigger auth writes — use useEffect/handlers only.
 */
export const createClientComponentClient = (): SupabaseClient<Database> => {
  if (typeof window === "undefined") {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
  ) as SupabaseClient<Database>;
};

/** Anonymous Supabase client for server code that must not use the user’s cookies (e.g. some RPCs). */
export const createAnonSupabaseClient = () => {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
};

/** Supabase client that acts as the bearer of the given access token (RLS uses JWT claims). */
export function createSupabaseWithAccessToken(accessToken: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function getAuthFromRequest(request: Request): Promise<
  | { ok: true; supabase: SupabaseClient<Database>; user: User }
  | { ok: false; message: string; status: number }
> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
  if (!token) {
    return { ok: false, message: "Authorization token required", status: 401 };
  }

  // MCP API key path: tokens prefixed with "wsu_live_" or "wsu_test_"
  if (token.startsWith("wsu_live_") || token.startsWith("wsu_test_")) {
    return getAuthFromMcpApiKey(token);
  }

  // Standard Supabase JWT path
  const supabase = createSupabaseWithAccessToken(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, message: "User authentication required", status: 401 };
  }
  return { ok: true, supabase, user };
}

async function getAuthFromMcpApiKey(apiKey: string): Promise<
  | { ok: true; supabase: SupabaseClient<Database>; user: User }
  | { ok: false; message: string; status: number }
> {
  try {
    const { createHash } = await import("crypto");
    const tokenHash = createHash("sha256").update(apiKey).digest("hex");

    const admin = createServiceRoleClient();

    const { data: mcpToken, error: tokenError } = await admin
      .from("mcp_tokens" as never)
      .select("user_id")
      .eq("token_hash", tokenHash)
      .single() as { data: { user_id: string } | null; error: unknown };

    if (tokenError || !mcpToken) {
      return { ok: false, message: "Invalid API key", status: 401 };
    }

    const { data: { user }, error: userError } = await admin.auth.admin.getUserById(mcpToken.user_id);
    if (userError || !user) {
      return { ok: false, message: "User not found", status: 401 };
    }

    // Update last_used_at (fire-and-forget)
    void admin
      .from("mcp_tokens" as never)
      .update({ last_used_at: new Date().toISOString() } as never)
      .eq("token_hash", tokenHash);

    return { ok: true, supabase: admin, user };
  } catch (err) {
    console.error("[getAuthFromMcpApiKey]", err);
    return { ok: false, message: "Authentication error", status: 500 };
  }
}

export async function getCurrentUser() {
  const supabase = createClientComponentClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * OAuth return URL only — **no `?next=` query**. Supabase matches the full `redirectTo` string
 * against Redirect URLs; a query suffix can fail to match a bare `/auth/callback` entry and
 * force fallback to Site URL (e.g. wardsignup.com). Post-auth path uses `AUTH_RETURN_STORAGE_KEY`
 * in sessionStorage (set on /login from `?next=`) plus `consumePostAuthPath` on /auth/callback.
 */
function oauthCallbackRedirectUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.origin}/auth/callback`;
}

export async function signInWithMagicLink(email: string) {
  if (typeof window === "undefined") {
    return { data: null, error: { message: "Magic link is only available in the browser." } as AuthError };
  }

  let next: string | undefined;
  try {
    const n = safeReturnPath(sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY));
    if (n) next = n;
  } catch {
    // sessionStorage may be unavailable
  }

  const res = await fetch("/api/auth/send-magic-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...posthogDistinctIdHeader(),
    },
    body: JSON.stringify({ email: email.trim(), next }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
  };

  if (!res.ok) {
    const message = json.error ?? res.statusText ?? "Please try again.";
    console.error("send-magic-link:", res.status, message);
    return { data: null, error: { message } as AuthError };
  }

  return { data: json, error: null };
}

export async function signInWithGoogle() {
  const supabase = createClientComponentClient();

  let redirectTo = oauthCallbackRedirectUrl();
  try {
    const res = await fetch("/api/auth/oauth-redirect-to", {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { redirectTo?: string };
    if (
      typeof json.redirectTo === "string" &&
      /^https?:\/\//.test(json.redirectTo) &&
      json.redirectTo.includes("/auth/callback")
    ) {
      redirectTo = json.redirectTo;
    }
  } catch {
    /* use client-built URL */
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // Force account chooser so users can switch Gmail accounts.
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    console.error("Google OAuth error:", error);
  }

  return { data, error };
}

export async function signOut() {
  const supabase = createClientComponentClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}
