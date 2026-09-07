"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/auth";
import { authDebug } from "@/lib/auth-debug";
import {
  exchangePkceClientDeduped,
  fetchAuthExchangeDeduped,
} from "@/lib/auth-exchange-dedupe";
import {
  AUTH_RETURN_STORAGE_KEY,
  consumePostAuthPath,
  safeReturnPath,
} from "@/lib/auth-return-path";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { usePostHog } from "posthog-js/react";

/** Remove ?code=, hash fragments (#access_token), etc. from the address bar after auth. */
function stripSensitiveUrlParams() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

function exchangeDedupeKey(code: string | null, token_hash: string | null): string | null {
  if (code) return `pkce:${code}`;
  if (token_hash) return `otp:${token_hash}`;
  return null;
}

/** JWT `sub` for idempotent client-side welcome trigger (effect re-runs, Strict Mode). */
function jwtSub(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = JSON.parse(atob(padded)) as { sub?: string };
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const [error, setError] = useState<string | null>(null);
  const welcomeFiredForSubRef = useRef<string | null>(null);

  const sendWelcomeEmail = (accessToken: string) => {
    const sub = jwtSub(accessToken);
    const guardId = sub ?? accessToken;
    const storageKey = sub
      ? `wardsignup_welcome_fire_${sub}`
      : `wardsignup_welcome_fire_tok_${accessToken.slice(0, 48)}`;

    if (welcomeFiredForSubRef.current === guardId) {
      return;
    }
    if (typeof sessionStorage !== "undefined") {
      try {
        if (sessionStorage.getItem(storageKey)) {
          return;
        }
        sessionStorage.setItem(storageKey, "1");
      } catch {
        // ignore
      }
    }
    welcomeFiredForSubRef.current = guardId;

    void fetch("/api/welcome", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch((err) => {
      console.error("Welcome email error:", err);
    });
  };

  useEffect(() => {
    const savedNext = safeReturnPath(searchParams.get("next"));

    const resolveDestination = async (accessToken: string, fallback: string): Promise<string> => {
      // Multi-org users with no saved selection get the chooser inserted before their
      // intended destination. Single-org users (the common case) skip this entirely.
      try {
        const res = await fetch("/api/organizations/list", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return fallback;
        const data = (await res.json().catch(() => ({}))) as {
          organizations?: Array<{ id: string }>;
          selectedOrgId?: string | null;
        };
        const count = data.organizations?.length ?? 0;
        if (count >= 2 && !data.selectedOrgId) {
          return `/orgs/select?next=${encodeURIComponent(fallback)}`;
        }
      } catch {
        // Network blip — fall back to the intended destination rather than block sign-in.
      }
      return fallback;
    };

    const goToAfterAuth = async (
      accessToken: string,
      opts?: { triggerWelcome?: boolean },
    ) => {
      stripSensitiveUrlParams();
      // Only after a fresh auth exchange — not when user already had a session (e.g. revisiting /auth/callback)
      if (opts?.triggerWelcome !== false) {
        sendWelcomeEmail(accessToken);
        const sub = jwtSub(accessToken);
        if (sub) posthog?.identify(sub);
        posthog?.capture("user_signed_in", { method: searchParams.get("code") ? "magic_link" : "google" });
      }
      const fallback = (() => {
        if (savedNext) {
          try {
            sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
          } catch {
            // ignore
          }
          return savedNext;
        }
        return consumePostAuthPath();
      })();
      const dest = await resolveDestination(accessToken, fallback);
      router.replace(dest);
    };

    const handleCallback = async () => {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));

      const errorParam = searchParams.get("error") || hashParams.get("error");
      const errorCode = searchParams.get("error_code") || hashParams.get("error_code");
      const errorDescription =
        searchParams.get("error_description") || hashParams.get("error_description");

      if (errorParam) {
        authDebug("callback error param", { error: errorParam, errorCode });
        if (errorCode === "otp_expired") {
          setError(
            "This magic link has expired. Please request a new one and click it immediately.",
          );
          return;
        }
        setError(errorDescription || "Authentication failed. Please try again.");
        return;
      }

      const code = searchParams.get("code");
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");

      authDebug("callback shape", {
        hasCode: Boolean(code),
        hasHashTokens: Boolean(access_token && refresh_token),
        hasOtp: Boolean(token_hash && type),
      });

      if (access_token && refresh_token) {
        authDebug("hash token flow");
        const supabase = createClientComponentClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          console.error("Auth hash token error:", sessionError.message);
          setError(`Failed to sign in: ${sessionError.message}`);
          return;
        }

        void goToAfterAuth(access_token);
        return;
      }

      if (code || (token_hash && type)) {
        authDebug("server-side auth exchange (PKCE / magic link)", {
          hasCode: Boolean(code),
          hasOtp: Boolean(token_hash && type),
        });

        const dedupe = exchangeDedupeKey(code, token_hash);
        if (!dedupe) {
          setError("Sign-in incomplete. Please try again.");
          return;
        }

        const exchangeResult = await fetchAuthExchangeDeduped(window.location.search, dedupe);

        if (!exchangeResult.ok) {
          if (code) {
            authDebug("server exchange failed; trying client PKCE exchange", {
              message: exchangeResult.message,
            });
            const clientPkce = await exchangePkceClientDeduped(code);
            if (clientPkce.ok && clientPkce.accessToken) {
              stripSensitiveUrlParams();
              void goToAfterAuth(clientPkce.accessToken);
              return;
            }
          }

          const supabase = createClientComponentClient();
          const {
            data: { session: recovered },
          } = await supabase.auth.getSession();
          if (recovered?.access_token) {
            authDebug("exchange failed but session exists (client/server race recovery)");
            void goToAfterAuth(recovered.access_token);
            return;
          }
          console.error("Auth exchange error:", exchangeResult.message);
          setError(`Failed to sign in: ${exchangeResult.message ?? "Please try again."}`);
          return;
        }

        stripSensitiveUrlParams();

        const supabase = createClientComponentClient();
        const {
          data: { session: postSession },
          error: postSessionError,
        } = await supabase.auth.getSession();

        if (postSessionError) {
          console.error("Auth session error:", postSessionError.message);
          setError(`Session error: ${postSessionError.message}`);
          return;
        }

        if (postSession?.access_token) {
          void goToAfterAuth(postSession.access_token);
          return;
        }

        setError("Sign-in incomplete. Please try again.");
        return;
      }

      const supabase = createClientComponentClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Auth session error:", sessionError.message);
        setError(`Session error: ${sessionError.message}`);
        return;
      }

      if (session?.access_token) {
        authDebug("existing session after redirect");
        void goToAfterAuth(session.access_token, { triggerWelcome: false });
        return;
      }

      setError(
        "Authentication failed. If you used email, request a new magic link. If you used Google, try signing in again.",
      );
    };

    void handleCallback();
  }, [router, searchParams, posthog]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.10)] p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 text-red-500"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="font-serif text-[22px] text-[#0D2B35] mb-3">Authentication Error</h1>
          <p className="text-[15px] text-[#5A8399] mb-7 leading-relaxed">{error}</p>
          <a
            href="/login"
            className="inline-block text-base font-semibold px-6 py-3 rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_6px_20px_rgba(14,150,176,0.38)] hover:-translate-y-0.5 transition-all"
          >
            Try Again
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-[15px] text-[#5A8399]">Signing you in…</p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-[15px] text-[#5A8399]">Loading…</p>
          </div>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
