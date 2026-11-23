"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { initAttributionTracking } from "@/lib/attribution";
import { scrubExceptionEvent } from "@/lib/pii-scrub";
import { isDemoAnalyticsPath } from "@/lib/posthog-client";
import { maskReplayNetworkRequest, scrubAuthParamsFromEvent } from "@/lib/posthog-url-scrub";

if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    capture_pageview: false, // handled by PostHogPageView
    capture_pageleave: true,
    person_profiles: "always",
    // Capture UTM params and custom ref parameter as person properties on first visit
    property_denylist: [],
    capture_performance: true,
    // Error tracking: unhandled errors and unhandled promise rejections become
    // $exception events tied to the session replay.
    capture_exceptions: true,
    // Sign in links carry token_hash, code or access_token in the URL, and
    // cancel / signup success links carry a token in the path. Replay page
    // URLs and network requests go through this hook; events are scrubbed
    // in before_send below.
    session_recording: {
      maskCapturedNetworkRequestFn: maskReplayNetworkRequest,
    },
    // Error messages can echo an email or a token; scrub $exception events
    // before they leave the browser (same rules as the server side). Then strip
    // sign in secrets (token_hash, code, ...) from URLs on every event.
    before_send: (event) => {
      const scrubbed = scrubAuthParamsFromEvent(scrubExceptionEvent(event));
      if (!scrubbed) return null;
      const url =
        (scrubbed.properties && (scrubbed.properties.$current_url as string | undefined)) ||
        (typeof window !== "undefined" ? window.location.href : "");
      if (isDemoAnalyticsPath(url) || (typeof window !== "undefined" && isDemoAnalyticsPath(window.location.pathname))) {
        return null;
      }
      return scrubbed;
    },
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize attribution tracking on mount
    // This captures first-touch attribution and sets PostHog person properties
    if (typeof window !== "undefined") {
      initAttributionTracking(posthog);
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
