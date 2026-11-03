/**
 * @jest-environment node
 */

const mockRevalidatePath = jest.fn();
jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const mockUpsert = jest.fn(async () => ({ error: null as null | { message: string } }));
const mockMaybeSingle = jest.fn(async (): Promise<{ data: unknown; error: null | { message: string } }> => ({
  data: null,
  error: null,
}));
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      upsert: mockUpsert,
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
        or: async () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

import {
  GEOGRAPHY_PUBLIC_CACHE_CONTROL,
  GEOGRAPHY_PUBLIC_PATH,
  fetchLiveGeographyFromPostHog,
  resolveGeographyPayload,
  revalidatePublicGeography,
  writeGeographyCache,
} from "@/lib/geography-cache";
import { formatMapUpdatedDate } from "@/lib/geography-format";
import { GEOGRAPHY_SNAPSHOT } from "@/lib/geography-snapshot";

const city = {
  city: "Mesa",
  country: "US",
  latitude: 33.4,
  longitude: -111.8,
  userCount: 3,
};

beforeEach(() => {
  mockRevalidatePath.mockReset();
  mockUpsert.mockClear();
  mockMaybeSingle.mockReset();
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

describe("public geography cache window", () => {
  it("is 1h fresh with a 1 day stale window", () => {
    expect(GEOGRAPHY_PUBLIC_CACHE_CONTROL).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
  });
});

describe("writeGeographyCache", () => {
  it("revalidates the public route after a successful write", async () => {
    const result = await writeGeographyCache([city]);
    expect(result.ok).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith(GEOGRAPHY_PUBLIC_PATH);
    expect(GEOGRAPHY_PUBLIC_PATH).toBe("/api/geography/public");
  });

  it("does not revalidate when the write fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "boom" } });
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await writeGeographyCache([city]);
    err.mockRestore();
    expect(result.ok).toBe(false);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("still succeeds if revalidatePath throws", async () => {
    mockRevalidatePath.mockImplementationOnce(() => {
      throw new Error("not in a request scope");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await writeGeographyCache([city]);
    warn.mockRestore();
    expect(result.ok).toBe(true);
  });
});

describe("revalidatePublicGeography", () => {
  it("returns false when revalidatePath throws", () => {
    mockRevalidatePath.mockImplementationOnce(() => {
      throw new Error("not in a request scope");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(revalidatePublicGeography()).toBe(false);
    warn.mockRestore();
  });
});

describe("fetchLiveGeographyFromPostHog", () => {
  it("bypasses the Next data cache so the cron writes fresh numbers", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ results: [["Mesa", "US", 33.4, -111.8, 3]] }),
    }));
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const rows = await fetchLiveGeographyFromPostHog();
      expect(rows).toEqual([city]);
      const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit & {
        next?: unknown;
      };
      expect(init.cache).toBe("no-store");
      expect(init.next).toBeUndefined();
    } finally {
      global.fetch = original;
      delete process.env.POSTHOG_PERSONAL_API_KEY;
    }
  });
});

describe("resolveGeographyPayload", () => {
  it("serves the DB snapshot and never calls PostHog", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        cities: [city],
        refreshed_at: "2026-10-23T03:17:22.267Z",
        source: "posthog",
        total_cities: 1,
      },
      error: null,
    });
    const fetchMock = jest.fn();
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const payload = await resolveGeographyPayload();
      expect(payload.totalCities).toBe(1);
      expect(payload.totalUsers).toBe(3);
      expect(payload.source).toBe("cache");
      expect(payload.refreshedAt).toBe("2026-10-23T03:17:22.267Z");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });

  it("falls back to the baked snapshot when the DB row is empty", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const fetchMock = jest.fn();
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const payload = await resolveGeographyPayload();
      expect(payload.source).toBe("snapshot");
      expect(payload.totalCities).toBe(GEOGRAPHY_SNAPSHOT.length);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });
});

describe("formatMapUpdatedDate", () => {
  it("formats the snapshot timestamp as a short Phoenix date", () => {
    expect(formatMapUpdatedDate("2026-10-19T00:35:00.000Z")).toBe("Oct 18, 2026");
  });
  it("returns null for missing or bad input", () => {
    expect(formatMapUpdatedDate(undefined)).toBeNull();
    expect(formatMapUpdatedDate("")).toBeNull();
    expect(formatMapUpdatedDate("not a date")).toBeNull();
  });
});
