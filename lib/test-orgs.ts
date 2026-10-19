/**
 * Server-only list of what counts as a test ward for analytics.
 *
 * A ward (organization) is a test ward when its campaign's user_email, the
 * campaign creator, or the organization owner is one of TEST_OWNER_EMAILS, or
 * when the organization id is listed in TEST_ORG_IDS.
 *
 * Product analytics only. This does not change who gets emails or what any
 * ward sees. The emails never leave the server; clients only get a boolean.
 */

/** Founder / team accounts. Keep lower case. */
export const TEST_OWNER_EMAILS: ReadonlySet<string> = new Set([
  "jonathan@wardsignup.com",
  "jon@jrbond.com",
  "bondesign@gmail.com",
]);

/**
 * Specific wards to treat as test by organization id, for wards whose owner is
 * not a test email. Empty on purpose: add an id here only once Jonathan has
 * confirmed the ward is a test ward (Sweetwater Branch is NOT confirmed).
 */
export const TEST_ORG_IDS: ReadonlySet<string> = new Set<string>([]);

export function isTestOwnerEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && TEST_OWNER_EMAILS.has(email.trim().toLowerCase());
}

export function isTestOrgId(orgId: string | null | undefined): boolean {
  return typeof orgId === "string" && TEST_ORG_IDS.has(orgId.toLowerCase());
}
