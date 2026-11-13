jest.mock("@/lib/supabase", () => ({ supabase: {} }));
import { BACKGROUND_REFRESH_AFTER_MS, needsBackgroundRefresh } from "@/components/event/hooks/useEventPageData";
import { EVENT_PAGE_CACHE_SECONDS } from "@/lib/event-page-cache-config";

const NOW = 1_800_000_000_000;

describe("needsBackgroundRefresh", () => {
  it("trusts server data for the whole server cache window (no extra browser DB read)", () => {
    expect(BACKGROUND_REFRESH_AFTER_MS).toBe(EVENT_PAGE_CACHE_SECONDS * 1000);
    expect(needsBackgroundRefresh(NOW - 14 * 60_000, NOW)).toBe(false);
  });

  it("skips the refresh for fresh server data (normal page load)", () => {
    expect(needsBackgroundRefresh(NOW, NOW)).toBe(false);
    expect(needsBackgroundRefresh(NOW - 30_000, NOW)).toBe(false);
    expect(needsBackgroundRefresh(NOW - BACKGROUND_REFRESH_AFTER_MS, NOW)).toBe(false);
  });

  it("refreshes old server data (back/forward to a cached page)", () => {
    expect(needsBackgroundRefresh(NOW - BACKGROUND_REFRESH_AFTER_MS - 1, NOW)).toBe(true);
    expect(needsBackgroundRefresh(NOW - 20 * 60_000, NOW)).toBe(true);
    // Served stale by the server after a quiet spell: the browser reloads it.
    expect(needsBackgroundRefresh(NOW - 2 * 60 * 60_000, NOW)).toBe(true);
  });

  it("refreshes when the age is unknown", () => {
    expect(needsBackgroundRefresh(undefined, NOW)).toBe(true);
    expect(needsBackgroundRefresh(Number.NaN, NOW)).toBe(true);
    // Browser clock far behind the server: can't trust the age.
    expect(needsBackgroundRefresh(NOW + 10 * 60_000, NOW)).toBe(true);
    // Small skew is fine.
    expect(needsBackgroundRefresh(NOW + 60_000, NOW)).toBe(false);
  });
});
