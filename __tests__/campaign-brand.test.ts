import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand/campaign-site";

describe("publicSiteOriginAndBrandForCampaign", () => {
  it("uses public_host when set", () => {
    const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
      brand_id: "orgsignup",
      public_host: "orgsignup.com",
    });
    expect(siteOrigin).toBe("https://orgsignup.com");
    expect(brand.id).toBe("orgsignup");
  });

  it("falls back to pack host when public_host missing", () => {
    const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
      brand_id: "ministrysignup",
      public_host: null,
    });
    expect(siteOrigin).toBe("https://ministrysignup.com");
    expect(brand.id).toBe("ministrysignup");
  });

  it("defaults unknown brand_id to wardsignup pack", () => {
    const { brand } = publicSiteOriginAndBrandForCampaign({
      brand_id: "not-a-real-pack",
      public_host: null,
    });
    expect(brand.id).toBe("wardsignup");
  });
});
