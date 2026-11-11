/**
 * @jest-environment node
 */
const mockResolve = jest.fn();
jest.mock("@/lib/geography-cache", () => ({
  ...jest.requireActual("@/lib/geography-cache"),
  resolveGeographyPayload: () => mockResolve(),
}));

import { GET, dynamic } from "@/app/api/geography/public/route";

const city = { city: "Mesa", country: "US", lat: 33.4, lng: -111.8, userCount: 3 };

beforeEach(() => {
  mockResolve.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/geography/public cache headers", () => {
  it("stays force-dynamic so the build never reads production Supabase", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("caches a DB cache row for 6h at the CDN with a purge tag", async () => {
    mockResolve.mockResolvedValue({ source: "cache", cities: [city], totalCities: 1, totalUsers: 3 });
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=21600, stale-while-revalidate=604800");
    expect(res.headers.get("Vercel-Cache-Tag")).toBe("geography-public");
  });

  it("keeps the snapshot fallback only 5 minutes so the DB is retried soon", async () => {
    mockResolve.mockResolvedValue({ source: "snapshot", cities: [city], totalCities: 1, totalUsers: 3 });
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300");
    const body = await res.json();
    expect(body.source).toBe("snapshot");
  });

  it("never caches a thrown error, and still serves the baked snapshot", async () => {
    mockResolve.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await res.json()).source).toBe("snapshot");
  });
});
