import type { PublicBrand } from "@/lib/brand";
import { withUtm, type UtmParams } from "@/lib/utm";

/** Default GitHub Sponsors URL (enable Sponsors on the account for this to resolve). */
export const DEFAULT_TIP_JAR_URL = "https://github.com/sponsors/jrbondesign";

/** localStorage key: post-create support prompt dismissed. */
export const SUPPORT_PROMPT_DISMISSED_KEY = "wardsignup_support_prompt_dismissed";

/** localStorage key: homepage support banner dismissed. */
export const SUPPORT_BANNER_DISMISSED_KEY = "wardsignup_support_banner_dismissed";

/**
 * Tip jar is on unless explicitly disabled via env (`0` / `false` / `off`)
 * or the brand omits `tipJarUrl` after env override resolves empty.
 */
export function isTipJarEnabled(brand?: Pick<PublicBrand, "tipJarUrl">): boolean {
  const flag = process.env.NEXT_PUBLIC_TIP_JAR_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return Boolean(resolveTipJarUrl(brand));
}

/**
 * Thin homepage support banner. Off by default; set
 * `NEXT_PUBLIC_SUPPORT_BANNER_ENABLED=1` to show (still respects tip-jar disable).
 */
export function isSupportBannerEnabled(brand?: Pick<PublicBrand, "tipJarUrl">): boolean {
  if (!isTipJarEnabled(brand)) return false;
  const flag = process.env.NEXT_PUBLIC_SUPPORT_BANNER_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on";
}

/** External sponsors / tip URL for a brand (env override wins). */
export function resolveTipJarUrl(
  brand?: Pick<PublicBrand, "tipJarUrl">,
): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_TIP_JAR_URL?.trim();
  if (fromEnv) return fromEnv;
  if (brand?.tipJarUrl) return brand.tipJarUrl;
  return DEFAULT_TIP_JAR_URL;
}

/** In-app marketing page that explains optional support. */
export function supportPagePath(): "/support-the-project" {
  return "/support-the-project";
}

export function supportPageUrl(brand: Pick<PublicBrand, "siteUrl">): string {
  return `${brand.siteUrl}${supportPagePath()}`;
}

/** Sponsors CTA with optional UTM (for email / outbound). */
export function tipJarOutboundUrl(
  brand: Pick<PublicBrand, "tipJarUrl"> | undefined,
  utm?: UtmParams,
): string | null {
  const url = resolveTipJarUrl(brand);
  if (!url) return null;
  return utm ? withUtm(url, utm) : url;
}

/** Support page URL with UTM (preferred for email footers — explanation before ask). */
export function supportPageOutboundUrl(
  brand: Pick<PublicBrand, "siteUrl">,
  utm?: UtmParams,
): string {
  const url = supportPageUrl(brand);
  return utm ? withUtm(url, utm) : url;
}
