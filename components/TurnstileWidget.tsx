"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Turnstile failed to load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget (managed mode: most people never see a
 * challenge). Renders nothing when no site key is configured. Calls onToken
 * with a fresh token, or null when it expires or errors. Bump resetKey after
 * each submit: tokens are single use. Expired tokens refresh on their own.
 *
 * appearance "interaction-only" keeps the widget hidden unless Cloudflare
 * actually needs the person to click something (the event signup forms).
 */
export default function TurnstileWidget({
  siteKey,
  onToken,
  onError,
  resetKey = 0,
  action = "magic_link",
  appearance = "always",
}: {
  siteKey: string | null;
  onToken: (token: string | null) => void;
  /** The widget or its script failed (blocked, offline). onToken(null) is called too. */
  onError?: () => void;
  resetKey?: number;
  action?: string;
  appearance?: "always" | "interaction-only";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
  }, [onToken, onError]);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          action,
          appearance,
          "refresh-expired": "auto",
          callback: (t: string) => onTokenRef.current(t),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => {
            onTokenRef.current(null);
            onErrorRef.current?.();
          },
        });
      })
      .catch(() => {
        onTokenRef.current(null);
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action, appearance]);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onTokenRef.current(null);
    }
  }, [resetKey]);

  if (!siteKey) return null;
  return (
    <div
      ref={ref}
      data-testid="turnstile-widget"
      className={appearance === "interaction-only" ? "flex justify-center empty:hidden" : "mb-5 flex justify-center"}
    />
  );
}
