import { campaignMatchesHostBrand } from "@/lib/campaign-brand-guard";
import { BRAND_DEFINITIONS, toPublicBrand } from "@/lib/brand/brands";

describe("campaignMatchesHostBrand", () => {
  const ward = toPublicBrand(BRAND_DEFINITIONS.wardsignup);

  it("matches when brand_id equals host pack", () => {
    expect(campaignMatchesHostBrand("wardsignup", ward)).toBe(true);
  });

  it("rejects legacy rows from retired brands", () => {
    expect(campaignMatchesHostBrand("ministrysignup", ward)).toBe(false);
    expect(campaignMatchesHostBrand("orgsignup", ward)).toBe(false);
  });

  it("treats missing brand_id as wardsignup legacy default", () => {
    expect(campaignMatchesHostBrand(undefined, ward)).toBe(true);
    expect(campaignMatchesHostBrand(null, ward)).toBe(true);
  });
});
