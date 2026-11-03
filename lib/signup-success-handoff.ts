/**
 * Hands the confirmation details from the event page to /signup-success so it
 * can render "You're signed up" without waiting on /api/signups/cancel/lookup.
 * Keyed by cancel token in sessionStorage; email links (no handoff) fall back
 * to the lookup.
 */

export type SignupSuccessInfo = {
  member_name: string;
  guest_names: string[];
  campaign_name: string;
  slot_label: string;
  event_url: string;
  session_date: string | null;
  session_time: string | null;
  session_end_time: string | null;
  event_timezone: string | null;
  event_end_date: string | null;
};

const PREFIX = "signup_success:";

export function saveSignupSuccessInfo(token: string, info: SignupSuccessInfo): void {
  try {
    sessionStorage.setItem(PREFIX + token, JSON.stringify(info));
  } catch {
    /* storage unavailable: the page falls back to the lookup */
  }
}

/** Raw stored JSON (stable string for useSyncExternalStore), or null. */
export function readSignupSuccessRaw(token: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + token);
  } catch {
    return null;
  }
}

export function parseSignupSuccessInfo(raw: string | null): SignupSuccessInfo | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as SignupSuccessInfo;
    return v && typeof v.member_name === "string" && typeof v.campaign_name === "string" ? v : null;
  } catch {
    return null;
  }
}
