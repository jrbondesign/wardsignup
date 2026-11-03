/** Env-tunable limits for the free tier. NEXT_PUBLIC_* is readable in client and server bundles. */

function positiveInt(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getMaxCampaignsPerUser(): number {
  return positiveInt(process.env.NEXT_PUBLIC_MAX_CAMPAIGNS_PER_USER, 10);
}

export function getMaxSessionsPerCampaign(): number {
  return positiveInt(process.env.MAX_SESSIONS_PER_CAMPAIGN, 500);
}

export function getMaxSessionsPerRequest(): number {
  return positiveInt(process.env.MAX_SESSIONS_PER_REQUEST, 100);
}

export function getMaxSessionCapacity(): number {
  return positiveInt(process.env.MAX_SESSION_CAPACITY, 500);
}

export function getSignupRateLimitPerIpPerHour(): number {
  return positiveInt(process.env.SIGNUP_RATE_LIMIT_PER_IP_PER_HOUR, 60);
}

export function isAppEmailInvitesEnabled(): boolean {
  return process.env.FEATURE_APP_EMAIL_INVITES === "true";
}

const UNLIMITED_EMAILS = new Set(["njcrowther22@gmail.com"]);

export function isUnlimitedEventsUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return UNLIMITED_EMAILS.has(email.toLowerCase());
}

/**
 * Per-organization event-limit overrides, keyed by organization id (lowercased UUID).
 * Keyed by id, not name, so renaming an org or moving its ward name into the
 * Ward/Unit field keeps the override, and another org that picks the same name
 * does not get it. Returns null when the org has no override, so callers fall back
 * to getMaxCampaignsPerUser().
 */
const ORG_EVENT_LIMIT_OVERRIDES: Record<string, number> = {
  "ab5867a1-c1a3-452e-a265-8419ed34bdb4": 5, // Sweetwater Branch
  "d3832817-8aa6-4ba1-96ab-9b0e23d5af4c": 5, // Sweetwater Branch
};

export function getMaxCampaignsForOrg(orgId: string | null | undefined): number | null {
  if (!orgId) return null;
  return ORG_EVENT_LIMIT_OVERRIDES[orgId.trim().toLowerCase()] ?? null;
}
