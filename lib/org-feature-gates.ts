/**
 * SERVER ONLY. Feature gates that combine the env allowlists with PostHog
 * flags (lib/posthog-flags.ts). Kept out of lib/gcal-feature.ts and
 * lib/cover-image-feature.ts because those are imported by client components
 * and must not pull posthog-node into the browser bundle.
 *
 * Fail closed: allowlisted OR flag on. If PostHog is down or errors, the flag
 * reads false and only the allowlist applies. The Google Calendar env kill
 * switch (FEATURE_GCAL_SYNC=1) always wins.
 */
import { isGcalSyncEnabledForOrg, isGcalSyncFeatureEnabled } from "@/lib/gcal-feature";
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";
import { FLAG_COVER_IMAGES, FLAG_GCAL_SYNC, allowlistOrFlag } from "@/lib/posthog-flags";

/** Kill switch AND (FEATURE_GCAL_SYNC_ORG_IDS allowlist OR `gcal-sync-beta` flag). */
export async function isGcalSyncEnabledForOrgOrFlag(orgId: string | null | undefined): Promise<boolean> {
  if (!isGcalSyncFeatureEnabled() || !orgId) return false;
  return allowlistOrFlag(isGcalSyncEnabledForOrg(orgId), FLAG_GCAL_SYNC, orgId);
}

/** NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS allowlist OR `event-cover-images` flag. */
export async function isCoverImageEnabledForOrgOrFlag(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  return allowlistOrFlag(isCoverImageEnabledForOrg(orgId), FLAG_COVER_IMAGES, orgId);
}
