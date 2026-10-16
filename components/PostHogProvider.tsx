"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { initAttributionTracking } from "@/lib/attribution";

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
