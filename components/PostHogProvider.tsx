"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

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
  
  // Register ref parameter if present in URL (for share link attribution)
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref) {
      posthog.register({ ref });
    }
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
