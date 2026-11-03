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

/**
 * Call on sign out: unlinks this browser from the signed-out person so the next
 * organizer on a shared ward computer starts as a fresh anonymous visitor.
 * Never throws; a no-op on the server or when PostHog isn't loaded.
 */
export function resetPostHogOnSignOut(): void {
  if (typeof window === "undefined") return;
  try {
    posthog.reset();
  } catch {
    // analytics must never block sign out
  }
}
