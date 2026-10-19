/**
 * Client-side org feature gates: the env allowlists (sync, from NEXT_PUBLIC_*
 * vars) OR the server's PostHog flag answer from
 * GET /api/organizations/[id]/features.
 *
 * Fail closed: until the server answers, or if the request fails, only the
 * allowlist applies. The Google Calendar client kill switch
 * (NEXT_PUBLIC_FEATURE_GCAL_SYNC=1) always wins.
 */
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";

export interface OrgFeatures {
  gcalSync: boolean;
  coverImages: boolean;
}

/** What the features endpoint returns; anything else is treated as all false. */
export type ServerOrgFeatures = Partial<Record<keyof OrgFeatures, unknown>> | null | undefined;

export function allowlistOrgFeatures(orgId: string | null | undefined): OrgFeatures {
  return {
    gcalSync: isGcalSyncUIEnabled(orgId ?? undefined),
    coverImages: isCoverImageEnabledForOrg(orgId),
  };
}

/** Pure combine step, unit tested. Only a literal `true` from the server counts. */
export function combineOrgFeatures(
  allowlist: OrgFeatures,
  server: ServerOrgFeatures,
  gcalClientSwitchOn: boolean,
): OrgFeatures {
  return {
    gcalSync: gcalClientSwitchOn && (allowlist.gcalSync || server?.gcalSync === true),
    coverImages: allowlist.coverImages || server?.coverImages === true,
  };
}

export function gcalClientSwitchOn(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC === "1";
}
