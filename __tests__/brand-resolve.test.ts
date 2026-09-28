import {
  getBrandForSiteOrigin,
  getBrandFromHost,
  isKnownBrandHost,
  normalizeHost,
  preferredBrandApexHost,
} from "@/lib/brand";

describe("brand resolve", () => {
  const prev = process.env.NEXT_PUBLIC_ACTIVE_BRAND;

  afterEach(() => {
    process.env.NEXT_PUBLIC_ACTIVE_BRAND = prev;
  });

  it("normalizes host and strips port", () => {
    expect(normalizeHost("WWW.Example.COM:443")).toBe("www.example.com");
    expect(normalizeHost("localhost:3000")).toBe("localhost");
  });

  it("maps wardsignup.com", () => {
    expect(getBrandFromHost("wardsignup.com").id).toBe("wardsignup");
  });

  it("maps retired ministry/org hosts to wardsignup", () => {
    expect(getBrandFromHost("orgsignup.com").id).toBe("wardsignup");
    expect(getBrandFromHost("ministrysignup.com").id).toBe("wardsignup");
    expect(getBrandFromHost("www.ministrysignup.com").id).toBe("wardsignup");
  });

  it("defaults unknown production-like host to wardsignup", () => {
    expect(getBrandFromHost("unknown-brand.example").id).toBe("wardsignup");
  });

  it("isKnownBrandHost", () => {
    expect(isKnownBrandHost("www.wardsignup.com")).toBe(true);
    expect(isKnownBrandHost("ministrysignup.com")).toBe(false);
    expect(isKnownBrandHost("orgsignup.com")).toBe(false);
    expect(isKnownBrandHost("evil.com")).toBe(false);
  });

  it("ignores NEXT_PUBLIC_ACTIVE_BRAND set to a retired brand", () => {
    process.env.NEXT_PUBLIC_ACTIVE_BRAND = "orgsignup";
    expect(getBrandFromHost("localhost").id).toBe("wardsignup");
    expect(getBrandFromHost("wardsignup.com").id).toBe("wardsignup");
    process.env.NEXT_PUBLIC_ACTIVE_BRAND = "ministrysignup";
    expect(getBrandFromHost("localhost").id).toBe("wardsignup");
  });

  it("getBrandForSiteOrigin matches pack siteUrl", () => {
    expect(getBrandForSiteOrigin("https://wardsignup.com/").id).toBe("wardsignup");
    expect(getBrandForSiteOrigin("https://orgsignup.com/").id).toBe("wardsignup");
    expect(getBrandForSiteOrigin("https://ministrysignup.com").id).toBe("wardsignup");
    expect(getBrandForSiteOrigin("https://unknown.example").id).toBe("wardsignup");
  });

  it("preferredBrandApexHost redirects www to apex", () => {
    expect(preferredBrandApexHost("www.wardsignup.com")).toBe("wardsignup.com");
    expect(preferredBrandApexHost("wardsignup.com")).toBeNull();
    expect(preferredBrandApexHost("www.ministrysignup.com")).toBeNull();
    expect(preferredBrandApexHost("localhost")).toBeNull();
    expect(preferredBrandApexHost("evil.com")).toBeNull();
  });
});
