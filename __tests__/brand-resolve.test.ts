import {
  getBrandForSiteOrigin,
  getBrandFromHost,
  isKnownBrandHost,
  normalizeHost,
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

  it("maps orgsignup hosts (prod + dev)", () => {
    expect(getBrandFromHost("orgsignup.com").id).toBe("orgsignup");
    expect(getBrandFromHost("orgsignup.localhost").id).toBe("orgsignup");
  });

  it("maps ministrysignup hosts", () => {
    expect(getBrandFromHost("ministrysignup.com").id).toBe("ministrysignup");
    expect(getBrandFromHost("www.ministrysignup.com").id).toBe("ministrysignup");
    expect(getBrandFromHost("ministrysignup.localhost").id).toBe("ministrysignup");
  });

  it("defaults unknown production-like host to wardsignup", () => {
    expect(getBrandFromHost("unknown-brand.example").id).toBe("wardsignup");
  });

  it("isKnownBrandHost", () => {
    expect(isKnownBrandHost("www.wardsignup.com")).toBe(true);
    expect(isKnownBrandHost("ministrysignup.com")).toBe(true);
    expect(isKnownBrandHost("evil.com")).toBe(false);
  });

  it("NEXT_PUBLIC_ACTIVE_BRAND overrides on localhost only", () => {
    process.env.NEXT_PUBLIC_ACTIVE_BRAND = "orgsignup";
    expect(getBrandFromHost("localhost").id).toBe("orgsignup");
    process.env.NEXT_PUBLIC_ACTIVE_BRAND = "orgsignup";
    expect(getBrandFromHost("wardsignup.com").id).toBe("wardsignup");
    process.env.NEXT_PUBLIC_ACTIVE_BRAND = "ministrysignup";
    expect(getBrandFromHost("localhost").id).toBe("ministrysignup");
  });

  it("getBrandForSiteOrigin matches pack siteUrl", () => {
    expect(getBrandForSiteOrigin("https://orgsignup.com/").id).toBe("orgsignup");
    expect(getBrandForSiteOrigin("https://ministrysignup.com").id).toBe("ministrysignup");
    expect(getBrandForSiteOrigin("https://wardsignup.com").id).toBe("wardsignup");
    expect(getBrandForSiteOrigin("https://unknown.example").id).toBe("wardsignup");
  });
});
