import { isDemoAnalyticsPath } from "@/lib/posthog-client";

describe("isDemoAnalyticsPath", () => {
  it("matches /demo and its subpaths only", () => {
    expect(isDemoAnalyticsPath("/demo")).toBe(true);
    expect(isDemoAnalyticsPath("/demo/create-layout")).toBe(true);
    expect(isDemoAnalyticsPath("/demo/create-layout?x=1")).toBe(true);
    expect(isDemoAnalyticsPath("https://wardsignup-preview.vercel.app/demo/create-layout")).toBe(true);
    expect(isDemoAnalyticsPath("/democracy")).toBe(false);
    expect(isDemoAnalyticsPath("/create")).toBe(false);
    expect(isDemoAnalyticsPath("https://wardsignup.com/create")).toBe(false);
    expect(isDemoAnalyticsPath("")).toBe(false);
    expect(isDemoAnalyticsPath(undefined)).toBe(false);
  });
});
