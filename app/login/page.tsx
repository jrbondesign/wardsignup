"use client";

import { useState, useEffect } from "react";
import { signInWithMagicLink, signInWithGoogle } from "@/lib/auth";
import {
  AUTH_RETURN_STORAGE_KEY,
  safeReturnPath,
} from "@/lib/auth-return-path";
import Link from "next/link";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";
import { usePostHog } from "posthog-js/react";

export default function LoginPage() {
  const brand = useBrand();
  const posthog = usePostHog();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [lastAttemptTime, setLastAttemptTime] = useState<number>(0);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const next = safeReturnPath(params.get("next"));
    if (next) {
      sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, next);
    } else {
      // Clear any stale return path — if there's no ?next= param, we don't
      // want a leftover value from a previous session redirecting the user
      // somewhere unexpected (e.g. /terms from a prior visit).
      sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }

    // Rate limiting: prevent requests within 10 seconds
    const now = Date.now();
    const timeSinceLastAttempt = now - lastAttemptTime;
    if (timeSinceLastAttempt < 10000) {
      const secondsRemaining = Math.ceil((10000 - timeSinceLastAttempt) / 1000);
      setError(`Please wait ${secondsRemaining} seconds before trying again.`);
      return;
    }

    setLoading(true);
    setError("");
    setLastAttemptTime(now);

    try {
      const { error: signInError } = await signInWithMagicLink(email);

      if (signInError) {
        console.error("Magic link error:", signInError);
        setError(`Failed to send magic link: ${signInError.message || "Please try again."}`);
      } else {
        // Don't identify by email — /auth/callback identifies by user id after
        // auth, and posthog-js won't merge two different identified ids.
        posthog?.capture("login_magic_link_sent", { email });
        setSent(true);
      }
    } catch (err: any) {
      console.error("Unexpected error:", err);
      setError(`An error occurred: ${err.message || "Please try again."}`);
    }

    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    posthog?.capture("login_google_initiated");
    try {
      const { error: googleError } = await signInWithGoogle();
      if (googleError) {
        setError(`Google sign-in failed: ${googleError.message}`);
        setGoogleLoading(false);
      }
      // On success browser navigates away — no cleanup needed
    } catch (err: any) {
      setError(`An error occurred: ${err.message || "Please try again."}`);
      setGoogleLoading(false);
    }
  };

  if (sent) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#F4FAFB] overflow-hidden">
        {/* Teal diagonal background band */}
        <div className="fixed top-[-20%] left-[-10%] right-[-10%] h-[55%] bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] -z-10"
             style={{ clipPath: "polygon(0 0, 100% 0, 100% 72%, 0 100%)" }} />

        {/* Radial gradients overlay */}
        <div className="fixed inset-0 -z-10 pointer-events-none"
             style={{
               background: "radial-gradient(ellipse at 15% 20%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(ellipse at 85% 60%, rgba(5,79,100,0.35) 0%, transparent 55%)"
             }} />

        {/* Success card */}
        <div className="relative z-10 w-full max-w-[460px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(8,100,126,0.16)] p-12 text-center animate-[fadeUp_0.5s_ease_both]">
          {/* Success icon */}
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] flex items-center justify-center mx-auto mb-4">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 text-white"
            >
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">
            Check your email
          </h1>
          <p className="text-sm text-[#5A8399] leading-relaxed mb-6">
            We sent a magic link to <strong className="text-[#0D2B35] font-semibold">{email}</strong>.<br/>
            Click the link in your email to sign in.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="text-sm text-[#0E96B0] hover:text-[#08647E] font-medium transition-colors"
          >
            Use a different email
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-[#F4FAFB] overflow-hidden">
      {/* Teal diagonal background band */}
      <div className="fixed top-[-20%] left-[-10%] right-[-10%] h-[55%] bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] -z-10"
           style={{ clipPath: "polygon(0 0, 100% 0, 100% 72%, 0 100%)" }} />

      {/* Radial gradients overlay */}
      <div className="fixed inset-0 -z-10 pointer-events-none"
           style={{
             background: "radial-gradient(ellipse at 15% 20%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(ellipse at 85% 60%, rgba(5,79,100,0.35) 0%, transparent 55%)"
           }} />

      {/* Back link */}
      <Link
        href="/"
        className="fixed top-6 left-8 z-10 inline-flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white hover:gap-2 transition-all"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to home
      </Link>

      {/* Sign-in card */}
      <div className="relative z-10 w-full max-w-[460px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(8,100,126,0.16)] p-11 animate-[fadeUp_0.5s_ease_both]">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 justify-center mb-8 no-underline">
          <img
            src={brand.logoSrc}
            alt={brand.logoAlt}
            className="w-11 h-11 rounded-[10px]"
          />
          <span className="font-serif text-2xl text-[#054F64] tracking-[0.5px]"
                style={{ WebkitTextStroke: "0.4px #054F64" }}>
            {brand.name}
          </span>
        </Link>

        {/* Divider */}
        <div className="w-full h-px bg-[rgba(14,150,176,0.10)] mb-8" />

        {/* Form section */}
        <h1 className="font-serif text-[32px] text-[#0D2B35] tracking-[-0.5px] mb-2">
          Sign In
        </h1>
        <p className="text-[15px] text-[#5A8399] mb-6 leading-relaxed">
          Continue with Google or use a magic link below
        </p>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 px-4 py-[14px] rounded-xl bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#0D2B35] text-[15px] font-semibold shadow-sm transition-all duration-200 hover:bg-[#F4FAFB] hover:border-[#0E96B0] hover:shadow-[0_4px_12px_rgba(14,150,176,0.15)] focus:outline-none focus:ring-2 focus:ring-[#0E96B0] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed mb-5"
        >
          {googleLoading ? (
            <LoadingSpinner size="sm" className="flex-shrink-0" />
          ) : (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-[rgba(14,150,176,0.12)]"/>
          <span className="text-xs font-medium text-[#5A8399] tracking-wide uppercase">or</span>
          <div className="flex-1 h-px bg-[rgba(14,150,176,0.12)]"/>
        </div>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="email"
            className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2"
          >
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full text-base text-[#0D2B35] px-[18px] py-[14px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all duration-200 focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 mb-5"
            disabled={loading}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full text-base font-semibold px-4 py-[15px] rounded-xl text-white border-none cursor-pointer shadow-[0_6px_20px_rgba(14,150,176,0.38)] transition-all duration-200 mb-5 ${
              loading
                ? "bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] shadow-[0_6px_20px_rgba(15,110,86,0.35)] cursor-default"
                : "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(14,150,176,0.45)] active:translate-y-0"
            }`}
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-[18px] py-[14px] text-sm leading-relaxed text-[#2E5566]">
          <strong className="text-[#0D2B35] font-semibold">No password needed!</strong> We'll send you a secure link to sign in.
        </div>
      </div>
    </main>
  );
}
