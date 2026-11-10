"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { initAttributionTracking } from "@/lib/attribution";
import { scrubExceptionEvent } from "@/lib/pii-scrub";
import { isDemoAnalyticsPath } from "@/lib/posthog-client";

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
    // Error messages can echo an email or a token; scrub $exception events
    // before they leave the browser (same rules as the server side).
    before_send: (event) => {
      const scrubbed = scrubExceptionEvent(event);
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
