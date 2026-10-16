/**
 * Client-side first-touch attribution tracking.
 * 
 * Captures UTM parameters and ref from the URL on first landing and persists
 * them in localStorage. First touch wins - once captured, attribution never changes
 * for that browser.
 * 
 * This data is later sent to the server when:
 * - A user signs up for an event (participant attribution)
 * - A user creates an account (creator attribution)
 * - A user creates an organization (org attribution)
 */

const ATTRIBUTION_KEY = "ws_first_touch_attribution";
const CAPTURE_TIMESTAMP_KEY = "ws_attribution_captured_at";

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ref?: string;
  captured_at: string; // ISO 8601 timestamp
}

/**
 * Get current URL parameters that could be attribution markers.
 */
function getAttributionFromUrl(): Omit<Attribution, "captured_at"> | null {
  if (typeof window === "undefined") return null;
  
  const params = new URLSearchParams(window.location.search);
  const utm_source = params.get("utm_source") || undefined;
  const utm_medium = params.get("utm_medium") || undefined;
  const utm_campaign = params.get("utm_campaign") || undefined;
  const ref = params.get("ref") || undefined;
  
  // Only return if at least one param exists
  if (utm_source || utm_medium || utm_campaign || ref) {
    return { utm_source, utm_medium, utm_campaign, ref };
  }
  
  return null;
}

/**
 * Get stored first-touch attribution from localStorage.
 */
export function getStoredAttribution(): Attribution | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  
  try {
    const stored = localStorage.getItem(ATTRIBUTION_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    // Validate structure
    if (typeof parsed === "object" && parsed !== null && typeof parsed.captured_at === "string") {
      return parsed as Attribution;
    }
  } catch (e) {
    console.error("Failed to parse stored attribution:", e);
  }
  
  return null;
}

/**
 * Capture and store first-touch attribution from current URL.
 * First touch wins - if attribution already exists, this is a no-op.
 * 
 * @returns The attribution data (either newly captured or existing), or null if none
 */
export function captureFirstTouchAttribution(): Attribution | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  
  // First touch wins - if we already have attribution, don't overwrite
  const existing = getStoredAttribution();
  if (existing) {
    return existing;
  }
  
  // Check if current URL has attribution params
  const urlAttribution = getAttributionFromUrl();
  if (!urlAttribution) {
    return null;
  }
  
  // Capture the first touch
  const attribution: Attribution = {
    ...urlAttribution,
    captured_at: new Date().toISOString(),
  };
  
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch (e) {
    console.error("Failed to store attribution:", e);
    return null;
  }
}

/**
 * Get attribution for server submission.
 * Returns an object with only the defined fields, ready to send to API.
 */
export function getAttributionForSubmission(): {
  first_touch_utm_source?: string;
  first_touch_utm_medium?: string;
  first_touch_utm_campaign?: string;
  first_touch_ref?: string;
} | null {
  const attribution = getStoredAttribution();
  if (!attribution) return null;
  
  return {
    ...(attribution.utm_source && { first_touch_utm_source: attribution.utm_source }),
    ...(attribution.utm_medium && { first_touch_utm_medium: attribution.utm_medium }),
    ...(attribution.utm_campaign && { first_touch_utm_campaign: attribution.utm_campaign }),
    ...(attribution.ref && { first_touch_ref: attribution.ref }),
  };
}

/**
 * Set attribution as PostHog person properties.
 * Call this on app initialization to ensure attribution is tracked in analytics.
 */
export function setAttributionAsPersonProperties(posthog: any): void {
  if (!posthog || typeof posthog.register !== "function") return;
  
  const attribution = getStoredAttribution();
  if (!attribution) return;
  
  const props: Record<string, string> = {};
  if (attribution.utm_source) props.first_touch_utm_source = attribution.utm_source;
  if (attribution.utm_medium) props.first_touch_utm_medium = attribution.utm_medium;
  if (attribution.utm_campaign) props.first_touch_utm_campaign = attribution.utm_campaign;
  if (attribution.ref) props.first_touch_ref = attribution.ref;
  
  if (Object.keys(props).length > 0) {
    posthog.register(props);
  }
}

/**
 * Initialize attribution tracking on page load.
 * Call this in your app's root component or layout.
 */
export function initAttributionTracking(posthog?: any): void {
  if (typeof window === "undefined") return;
  
  // Capture attribution from URL if present (first touch only)
  captureFirstTouchAttribution();
  
  // Set as PostHog person properties if posthog is provided
  if (posthog) {
    setAttributionAsPersonProperties(posthog);
  }
}
