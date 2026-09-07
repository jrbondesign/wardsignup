import { BRAND_DEFINITIONS, DEFAULT_BRAND_ID, toPublicBrand } from "./brands";
import type { BrandId } from "./types";
import type { PublicBrand } from "./types";

/** Campaign row fields used to build public links and pick email pack (cron / manual report). */
export type CampaignBrandFields = {
  brand_id?: string | null;
  public_host?: string | null;
};

function parseBrandId(raw: string | null | undefined): BrandId {
  const t = raw?.trim();
  if (t && t in BRAND_DEFINITIONS) return t as BrandId;
  return DEFAULT_BRAND_ID;
}

/**
 * Public site origin (no trailing slash) and brand for transactional emails and links.
 * Uses `public_host` when set; otherwise the pack’s canonical host from `brand_id`.
 */
export function publicSiteOriginAndBrandForCampaign(
  row: CampaignBrandFields,
): { siteOrigin: string; brand: PublicBrand } {
  const brand = toPublicBrand(BRAND_DEFINITIONS[parseBrandId(row.brand_id)]);
  const host = row.public_host?.trim() || brand.siteHost;
  const siteOrigin = host.includes("://")
    ? host.replace(/\/$/, "")
    : `https://${host}`;
  return { siteOrigin, brand };
}
