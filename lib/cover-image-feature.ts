/**
 * Event cover image feature gate (org allowlist).
 *
 * NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS: comma-separated org UUIDs. Read on both
 * server and client (org IDs aren't secret). Empty/unset = feature dark for everyone.
 * Gates upload UI, the upload API, and every place a cover is rendered (event page,
 * flyer, OG image, invite email), so an existing cover_image_url stays hidden for
 * orgs outside the allowlist.
 */
export function isCoverImageEnabledForOrg(orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  const allowlist = (process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return allowlist.includes(orgId);
}
