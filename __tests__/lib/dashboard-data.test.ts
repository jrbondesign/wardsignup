import {
  dashboardCardStats,
  loadDashboardViaRpc,
  normalizeDashboardPayload,
  summarizeNestedCampaign,
  type DashboardEvent,
} from "@/lib/dashboard-data";
import type { SupabaseClient } from "@supabase/supabase-js";

const nested = {
  id: "e1",
  name: "Ev",
  created_at: "2026-10-01T00:00:00Z",
  event_type: "spots",
  event_date: null,
  event_dates: null,
  sessions: [
    { id: "s1", capacity: 3, session_date: "2026-11-02", signups: [{ id: "a" }, { id: "b" }] },
    { id: "s2", capacity: 2, session_date: "2026-11-01", signups: [] },
    { id: "s3", capacity: null, session_date: null, signups: null },
  ],
  campaign_items: [],
};

describe("summarizeNestedCampaign (old query shape)", () => {
  it("reduces nested ids to counts", () => {
    expect(summarizeNestedCampaign(nested)).toEqual({
      id: "e1",
      name: "Ev",
      created_at: "2026-10-01T00:00:00Z",
      event_type: "spots",
      event_date: null,
      event_dates: null,
      session_dates: ["2026-11-01", "2026-11-02"],
      total_capacity: 5,
      total_signups: 2,
      item_count: 0,
      item_signups: 0,
      unclaimed_items: 0,
    });
  });

  it("counts claimed and unclaimed items", () => {
    const e = summarizeNestedCampaign({
      ...nested,
      event_type: "items",
      sessions: [],
      campaign_items: [{ id: "i1", item_signups: [{ id: "x" }, { id: "y" }] }, { id: "i2", item_signups: [] }],
    });
    expect([e.item_count, e.item_signups, e.unclaimed_items]).toEqual([2, 2, 1]);
  });
});

describe("dashboardCardStats", () => {
  const base = summarizeNestedCampaign(nested);
  it("spots: capacity, signups, remaining and fill", () => {
    expect(dashboardCardStats(base)).toEqual({ isItems: false, totalCapacity: 5, totalSignups: 2, remaining: 3, fillPct: 40 });
  });
  it("items: items, claimed, unclaimed", () => {
    const e: DashboardEvent = { ...base, event_type: "items", item_count: 4, item_signups: 3, unclaimed_items: 2 };
    expect(dashboardCardStats(e)).toEqual({ isItems: true, totalCapacity: 4, totalSignups: 3, remaining: 2, fillPct: 75 });
  });
  it("no capacity means 0% instead of NaN", () => {
    expect(dashboardCardStats({ ...base, total_capacity: 0, total_signups: 0 }).fillPct).toBe(0);
  });
});

describe("normalizeDashboardPayload", () => {
  it("returns null for null (no signed in user)", () => {
    expect(normalizeDashboardPayload(null)).toBeNull();
  });
  it("coerces bigint counts and defaults missing arrays", () => {
    const out = normalizeDashboardPayload({
      org: { id: "o1", name: "Ward", needs_naming: false, brand_id: "wardsignup" },
      events: [{ id: "e1", name: "Ev", created_at: "t", event_type: "spots", total_capacity: "7", total_signups: 2 }],
    })!;
    expect(out.org?.name).toBe("Ward");
    expect(out.events[0]).toMatchObject({ total_capacity: 7, total_signups: 2, session_dates: [], item_count: 0 });
  });
});

describe("loadDashboardViaRpc", () => {
  it("calls get_dashboard_events with the brand", async () => {
    const rpc = jest.fn(async () => ({ data: { org: null, events: [] }, error: null }));
    const out = await loadDashboardViaRpc({ rpc } as unknown as SupabaseClient, "wardsignup");
    expect(rpc).toHaveBeenCalledWith("get_dashboard_events", { p_brand_id: "wardsignup" });
    expect(out).toEqual({ org: null, events: [] });
  });
  it("resolves null (so the page falls back) when the RPC is missing or throws", async () => {
    const missing = jest.fn(async () => ({ data: null, error: { code: "PGRST202" } }));
    expect(await loadDashboardViaRpc({ rpc: missing } as unknown as SupabaseClient, "wardsignup")).toBeNull();
    const throws = jest.fn(async () => {
      throw new Error("network");
    });
    expect(await loadDashboardViaRpc({ rpc: throws } as unknown as SupabaseClient, "wardsignup")).toBeNull();
  });
});
