import { formatLocationLine, locationFromVercelHeaders } from "@/lib/request-geo";

const h = (o: Record<string, string>) => new Headers(o);

describe("locationFromVercelHeaders", () => {
  it("formats a US location as City, ST", () => {
    expect(
      locationFromVercelHeaders(
        h({ "x-vercel-ip-city": "Salt%20Lake%20City", "x-vercel-ip-country-region": "ut", "x-vercel-ip-country": "US" }),
      ),
    ).toBe("Salt Lake City, UT");
  });
  it("adds the country outside the US", () => {
    expect(
      locationFromVercelHeaders(
        h({ "x-vercel-ip-city": "S%C3%A3o%20Paulo", "x-vercel-ip-country-region": "SP", "x-vercel-ip-country": "BR" }),
      ),
    ).toBe("São Paulo, SP, BR");
  });
  it("returns null without geo headers", () => {
    expect(locationFromVercelHeaders(h({}))).toBeNull();
    expect(locationFromVercelHeaders(h({ "x-vercel-ip-country": "US" }))).toBeNull();
  });
  it("drops values that look like markup", () => {
    expect(locationFromVercelHeaders(h({ "x-vercel-ip-city": "%3Cscript%3E", "x-vercel-ip-country-region": "AZ" }))).toBe("AZ");
  });
});

describe("formatLocationLine", () => {
  it("shows the location or a fallback", () => {
    expect(formatLocationLine("Mesa, AZ")).toBe("Location: Mesa, AZ");
    expect(formatLocationLine(null)).toBe("Location unknown");
    expect(formatLocationLine("  ")).toBe("Location unknown");
  });
});
