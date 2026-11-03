"use client";

import { useCallback, useRef, useState } from "react";

// Literal reference so Next inlines it in the client bundle. Unset: captcha off.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

/** Copy for the public signup forms. No dashes: customer copy. */
export const CAPTCHA_NOT_READY =
  "We couldn't finish the quick security check. Please wait a moment and try again.";
export const CAPTCHA_LOAD_FAILED =
  "The security check couldn't load. Please refresh the page and try again. If you use a content blocker, allow challenges.cloudflare.com.";

/**
 * One Turnstile widget's state for a form. Off (every call is a no-op and
 * getToken resolves null) when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset.
 *
 * getToken waits up to timeoutMs for the widget so a fast click on Sign Up
 * doesn't fail while the invisible check is still running. Call reset() after
 * every submit: tokens are single use.
 */
export function useCaptcha(siteKey: string | null = TURNSTILE_SITE_KEY) {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const waiters = useRef<Array<(t: string) => void>>([]);

  const onToken = useCallback((t: string | null) => {
    tokenRef.current = t;
    setToken(t);
    if (t) {
      setFailed(false);
      const pending = waiters.current;
      waiters.current = [];
      pending.forEach((w) => w(t));
    }
  }, []);

  const onError = useCallback(() => setFailed(true), []);

  const getToken = useCallback(
    (timeoutMs = 8000): Promise<string | null> => {
      if (!siteKey) return Promise.resolve(null);
      if (tokenRef.current) return Promise.resolve(tokenRef.current);
      return new Promise((resolve) => {
        const waiter = (t: string) => {
          clearTimeout(timer);
          resolve(t);
        };
        const timer = setTimeout(() => {
          waiters.current = waiters.current.filter((w) => w !== waiter);
          resolve(null);
        }, timeoutMs);
        waiters.current.push(waiter);
      });
    },
    [siteKey],
  );

  const reset = useCallback(() => {
    if (!siteKey) return;
    tokenRef.current = null;
    setToken(null);
    setResetKey((n) => n + 1);
  }, [siteKey]);

  /** Error text when getToken came back empty. */
  const missingMessage = failed ? CAPTCHA_LOAD_FAILED : CAPTCHA_NOT_READY;

  return { siteKey, enabled: Boolean(siteKey), token, onToken, onError, failed, resetKey, getToken, reset, missingMessage };
}

export type CaptchaState = ReturnType<typeof useCaptcha>;
