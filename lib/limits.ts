/** Env-tunable limits for free beta. NEXT_PUBLIC_* is readable in client and server bundles. */

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
 * Per-organization event-limit overrides, keyed by lowercased org name. Lets specific
 * orgs run a higher cap than the default free-beta limit without granting unlimited
 * events. Returns null when the org has no override, so callers fall back to
 * getMaxCampaignsPerUser().
 */
const ORG_EVENT_LIMIT_OVERRIDES: Record<string, number> = {
  "sweetwater branch": 5,
};

export function getMaxCampaignsForOrg(orgName: string | null | undefined): number | null {
  if (!orgName) return null;
  return ORG_EVENT_LIMIT_OVERRIDES[orgName.trim().toLowerCase()] ?? null;
}
