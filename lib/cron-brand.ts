import {
  BRAND_DEFINITIONS,
  DEFAULT_BRAND_ID,
  getBrandFromHost,
  isKnownBrandHost,
} from "@/lib/brand";
import type { BrandId } from "@/lib/brand/types";

/**
 * Resolve which brand a cron invocation should process.
 *
 * Prefer the request Host when it is a known brand hostname, so a wrong or
 * missing NEXT_PUBLIC_BRAND_ID can't change the claim key. Fall back to
 * NEXT_PUBLIC_BRAND_ID, then wardsignup. Retired hosts (ministrysignup.com,
 * orgsignup.com) resolve to wardsignup.
 */
export function resolveCronBrandId(request: Request): BrandId {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (isKnownBrandHost(host)) {
    return getBrandFromHost(host).id;
  }
  const env = (process.env.NEXT_PUBLIC_BRAND_ID ?? "").trim().toLowerCase();
  if (env && env in BRAND_DEFINITIONS) return env as BrandId;
  return DEFAULT_BRAND_ID;
}
