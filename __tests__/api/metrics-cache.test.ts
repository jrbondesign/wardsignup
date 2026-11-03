/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/posthog-query", () => ({
  posthogWeeklyEventCounts: jest.fn(async () => null),
  posthogCoreWeekly: jest.fn(async () => null),
}));

// Stand in for Next's data cache: record the options and serve a canned body.
jest.mock("next/cache", () => {
  const calls: { keyParts: string[]; opts: { revalidate?: number; tags?: string[] } }[] = [];
  const cached = jest.fn(async (brandKey: string) => ({ cachedFor: brandKey }));
  return {
    __calls: calls,
    __cached: cached,
    unstable_cache: (_fn: unknown, keyParts: string[], opts: { revalidate?: number; tags?: string[] }) => {
      calls.push({ keyParts, opts });
      return (brandKey: string) => cached(brandKey);
    },
  };
});

import { GET } from "@/app/api/metrics/route";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const nextCacheMock = jest.requireMock("next/cache") as {
  __calls: { keyParts: string[]; opts: { revalidate?: number; tags?: string[] } }[];
  __cached: jest.Mock;
};
const mockCacheOptions = nextCacheMock.__calls;
const mockCached = nextCacheMock.__cached;
const ADMIN_EMAIL = "bondesign@gmail.com";

function asUser(email: string | null) {
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: async () =>
        email ? { data: { user: { id: "u", email } }, error: null } : { data: { user: null }, error: { message: "bad" } },
    },
  } as never);
}

const get = (url: string, token: string | null = "tok") =>
  GET(new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

describe("GET /api/metrics caching", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      METRICS_ADMIN_EMAILS: ADMIN_EMAIL,
    };
    mockCached.mockClear();
  });
  afterEach(() => {
    process.env = env;
  });

  it("caches the aggregate for about 10 minutes", () => {
    expect(mockCacheOptions).toHaveLength(1);
    expect(mockCacheOptions[0]!.opts.revalidate).toBe(600);
    expect(mockCacheOptions[0]!.opts.tags).toEqual(["founder-metrics"]);
  });

  it("still checks auth on every request, before the cache", async () => {
    expect((await get("http://wardsignup.com/api/metrics", null)).status).toBe(401);
    asUser(null);
    expect((await get("http://wardsignup.com/api/metrics")).status).toBe(403);
    asUser("someone@example.com");
    expect((await get("http://wardsignup.com/api/metrics")).status).toBe(403);
    expect(mockCached).not.toHaveBeenCalled();
  });

  it("serves the cached body to the metrics admin, keyed by brand tab", async () => {
    asUser(ADMIN_EMAIL);
    const all = await get("http://wardsignup.com/api/metrics");
    expect(all.status).toBe(200);
    expect(await all.json()).toEqual({ cachedFor: "all" });
    const ws = await get("http://wardsignup.com/api/metrics?brand=wardsignup");
    expect(await ws.json()).toEqual({ cachedFor: "wardsignup" });
    const bogus = await get("http://wardsignup.com/api/metrics?brand=nope");
    expect(await bogus.json()).toEqual({ cachedFor: "all" });
  });
});
