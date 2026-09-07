import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { BRAND_DEFINITIONS, toPublicBrand } from "@/lib/brand/brands";

describe("campaignMatchesHostBrand", () => {
  const ward = toPublicBrand(BRAND_DEFINITIONS.wardsignup);
  const ministry = toPublicBrand(BRAND_DEFINITIONS.ministrysignup);

  it("matches when brand_id equals host pack", () => {
    expect(campaignMatchesHostBrand("ministrysignup", ministry)).toBe(true);
    expect(campaignMatchesHostBrand("wardsignup", ward)).toBe(true);
  });

  it("rejects cross-tenant brand_id", () => {
    expect(campaignMatchesHostBrand("wardsignup", ministry)).toBe(false);
    expect(campaignMatchesHostBrand("ministrysignup", ward)).toBe(false);
  });

  it("treats missing brand_id as wardsignup legacy default", () => {
    expect(campaignMatchesHostBrand(undefined, ward)).toBe(true);
    expect(campaignMatchesHostBrand(null, ministry)).toBe(false);
  });
});
