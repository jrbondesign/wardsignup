"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";
import { isDemoAnalyticsPath } from "@/lib/posthog-client";

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    // Preview /demo fixtures share the live PostHog project. Do not opt out
    // persistently: that would silence later preview pageviews on this origin.
    if (isDemoAnalyticsPath(pathname)) return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname, searchParams, posthog]);

  return null;
}
