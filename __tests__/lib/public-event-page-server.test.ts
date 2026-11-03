const mockLoad = jest.fn();
jest.mock("@/lib/public-event-page", () => ({ loadPublicEventPage: (...a: unknown[]) => mockLoad(...a) }));
const mockCover = jest.fn();
jest.mock("@/lib/event-media", () => ({ publicCoverForCampaign: (...a: unknown[]) => mockCover(...a) }));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({}) }));
jest.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }));
// unstable_cache needs Next's incremental cache; record its options and run the loader directly.
const mockUnstableCache = jest.fn();
jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown, keyParts: string[], opts: unknown) => {
    mockUnstableCache(keyParts, opts);
    return fn;
  },
  revalidateTag: jest.fn(),
}));

import {
  getServerEventCover,
  getServerEventPage,
  getServerEventSnapshot,
  SERVER_LOAD_TIMEOUT_MS,
  withTimeout,
} from "@/lib/public-event-page-server";

const ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockLoad.mockReset();
  mockCover.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("withTimeout", () => {
  it("returns the value when it is fast and undefined when it is slow", async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
    await expect(withTimeout(new Promise(() => {}), 10)).resolves.toBeUndefined();
  });
});

describe("getServerEventPage", () => {
  it("returns null for an id that is not a uuid, without a database call", async () => {
    await expect(getServerEventPage("nope")).resolves.toBeNull();
    expect(mockLoad).not.toHaveBeenCalled();
  });
  it("passes through loaded data and null (not found)", async () => {
    mockLoad.mockResolvedValueOnce({ event: { id: ID } });
    await expect(getServerEventPage(ID)).resolves.toEqual({ event: { id: ID } });
    mockLoad.mockResolvedValueOnce(null);
    await expect(getServerEventPage(ID)).resolves.toBeNull();
  });
  it("returns undefined (let the browser load) on error or timeout", async () => {
    mockLoad.mockRejectedValueOnce(new Error("down"));
    await expect(getServerEventPage(ID)).resolves.toBeUndefined();
    jest.useFakeTimers();
    mockLoad.mockReturnValueOnce(new Promise(() => {}));
    const p = getServerEventPage(ID);
    jest.advanceTimersByTime(SERVER_LOAD_TIMEOUT_MS + 1);
    await expect(p).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});

describe("getServerEventSnapshot", () => {
  it("shares the read across requests for 30-60 s under a per-event tag", async () => {
    mockUnstableCache.mockReset();
    mockLoad.mockResolvedValueOnce({ event: { id: ID } });
    const before = Date.now();
    const snap = await getServerEventSnapshot(ID);
    expect(snap?.page).toEqual({ event: { id: ID } });
    expect(snap!.loadedAt).toBeGreaterThanOrEqual(before);
    const [keyParts, opts] = mockUnstableCache.mock.calls[0] as [string[], { revalidate: number; tags: string[] }];
    expect(keyParts).toContain(ID);
    expect(opts.tags).toEqual([`event-page:${ID}`]);
    expect(opts.revalidate).toBeGreaterThanOrEqual(30);
    expect(opts.revalidate).toBeLessThanOrEqual(60);
  });
  it("returns null for a missing event and undefined on failure (never cached)", async () => {
    mockLoad.mockResolvedValueOnce(null);
    await expect(getServerEventSnapshot(ID)).resolves.toBeNull();
    mockLoad.mockRejectedValueOnce(new Error("down"));
    await expect(getServerEventSnapshot(ID)).resolves.toBeUndefined();
  });
});

describe("getServerEventCover", () => {
  it("returns the gated cover, or undefined on failure", async () => {
    mockCover.mockResolvedValueOnce({ url: "u", position: "50% 50%" });
    await expect(getServerEventCover(ID)).resolves.toEqual({ url: "u", position: "50% 50%" });
    mockCover.mockResolvedValueOnce(null);
    await expect(getServerEventCover(ID)).resolves.toBeNull();
    mockCover.mockRejectedValueOnce(new Error("no key"));
    await expect(getServerEventCover(ID)).resolves.toBeUndefined();
  });
});
