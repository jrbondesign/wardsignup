import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand/campaign-site";

describe("publicSiteOriginAndBrandForCampaign", () => {
  it("uses public_host when set", () => {
    const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
      brand_id: "wardsignup",
      public_host: "www.wardsignup.com",
    });
    expect(siteOrigin).toBe("https://www.wardsignup.com");
    expect(brand.id).toBe("wardsignup");
  });

  it("falls back to pack host when public_host missing", () => {
    const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
      brand_id: "wardsignup",
      public_host: null,
    });
    expect(siteOrigin).toBe("https://wardsignup.com");
    expect(brand.id).toBe("wardsignup");
  });

  it("defaults retired or unknown brand_id to wardsignup pack", () => {
    for (const brand_id of ["ministrysignup", "orgsignup", "not-a-real-pack"]) {
      const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
        brand_id,
        public_host: null,
      });
      expect(siteOrigin).toBe("https://wardsignup.com");
      expect(brand.id).toBe("wardsignup");
    }
  });
});
