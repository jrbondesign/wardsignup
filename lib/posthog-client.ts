import posthog from "posthog-js";

/**
 * Header carrying the browser's PostHog distinct id, so server-side captures
 * land on the same person as the client-side session. Returns {} when PostHog
 * isn't initialized (SSR, blocked, or opted out).
 */
export function posthogDistinctIdHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const id = posthog.get_distinct_id();
    return id ? { "x-posthog-distinct-id": id } : {};
  } catch {
    return {};
  }
}
