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
 * confirmed the ward is a test ward. Sweetwater Branch is real, see REAL_ORG_IDS.
 */
export const TEST_ORG_IDS: ReadonlySet<string> = new Set<string>([]);

/**
 * Real wards (ward, branch or stake) that must never count as test, even when
 * a founder account created their events. Jonathan confirmed 2026-10-20 that
 * every Sweetwater Branch org is a real branch.
 */
export const REAL_ORG_IDS: ReadonlySet<string> = new Set<string>([
  "ab5867a1-c1a3-452e-a265-8419ed34bdb4", // Sweetwater Branch
  "d3832817-8aa6-4ba1-96ab-9b0e23d5af4c", // Sweetwater Branch
  "37e69b6d-ae9e-4e1e-8587-47173392d408", // RS Sweetwater Branch
]);

export function isRealOrgId(orgId: string | null | undefined): boolean {
  return typeof orgId === "string" && REAL_ORG_IDS.has(orgId.toLowerCase());
}

export function isTestOwnerEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && TEST_OWNER_EMAILS.has(email.trim().toLowerCase());
}

export function isTestOrgId(orgId: string | null | undefined): boolean {
  return typeof orgId === "string" && !isRealOrgId(orgId) && TEST_ORG_IDS.has(orgId.toLowerCase());
}
