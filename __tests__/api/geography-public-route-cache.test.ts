/**
 * @jest-environment node
 */
const mockResolve = jest.fn();
jest.mock("@/lib/geography-cache", () => ({
  ...jest.requireActual("@/lib/geography-cache"),
  resolveGeographyPayload: () => mockResolve(),
}));

import { GET, dynamic } from "@/app/api/geography/public/route";
import {
  clearLastGoodGeography,
  GEOGRAPHY_FALLBACK_CACHE_CONTROL,
  GEOGRAPHY_PUBLIC_CACHE_CONTROL,
  rememberLastGoodGeography,
} from "@/lib/geography-cache";

const city = { city: "Mesa", country: "US", latitude: 33.4, longitude: -111.8, userCount: 3 };
const cachePayload = {
  source: "cache" as const,
  cities: [city],
  totalCities: 1,
  totalUsers: 3,
  generatedAt: "2026-11-13T15:01:03.324Z",
  refreshedAt: "2026-11-13T15:01:03.324Z",
};

beforeEach(() => {
  mockResolve.mockReset();
  clearLastGoodGeography();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  clearLastGoodGeography();
});

function expectCdnHeaders(res: Response, cacheControl: string, tag?: string) {
  expect(res.headers.get("Cache-Control")).toBe(cacheControl);
  expect(res.headers.get("CDN-Cache-Control")).toBe(cacheControl);
  expect(res.headers.get("Vercel-CDN-Cache-Control")).toBe(cacheControl);
  expect(res.headers.get("Vercel-Cache-Tag")).toBe(tag ?? null);
}

describe("GET /api/geography/public cache headers", () => {
  it("stays force-dynamic so the build never reads production Supabase", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("caches a DB cache row for 6h at the CDN with a purge tag", async () => {
    mockResolve.mockResolvedValue(cachePayload);
    const res = await GET();
    expectCdnHeaders(
      res,
      GEOGRAPHY_PUBLIC_CACHE_CONTROL,
      "geography-public",
    );
    expect(GEOGRAPHY_PUBLIC_CACHE_CONTROL).toBe(
      "public, s-maxage=21600, stale-while-revalidate=604800",
    );
  });

  it("does not let the CDN cache a baked-snapshot fallback", async () => {
    mockResolve.mockResolvedValue({ source: "snapshot", cities: [city], totalCities: 1, totalUsers: 3 });
    const res = await GET();
    expectCdnHeaders(res, GEOGRAPHY_FALLBACK_CACHE_CONTROL);
    expect(GEOGRAPHY_FALLBACK_CACHE_CONTROL).toBe("private, no-store");
    const body = await res.json();
    expect(body.source).toBe("snapshot");
  });

  it("serves last-good with cacheable headers when the resolver throws", async () => {
    rememberLastGoodGeography(cachePayload);
    mockResolve.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expectCdnHeaders(res, GEOGRAPHY_PUBLIC_CACHE_CONTROL, "geography-public");
    const body = await res.json();
    expect(body.source).toBe("cache");
    expect(body.totalUsers).toBe(3);
    expect(body.refreshedAt).toBe("2026-11-13T15:01:03.324Z");
  });

  it("never caches a thrown error when there is no last-good, and still serves the baked snapshot", async () => {
    mockResolve.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expectCdnHeaders(res, "private, no-store");
    expect((await res.json()).source).toBe("snapshot");
  });
});
