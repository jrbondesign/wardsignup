import { describe, it, expect } from "@jest/globals";
import { computeWardFirstEvents, type OrgWithAttribution } from "@/lib/new-wards";
import { fetchAllRows, SUPABASE_PAGE_SIZE } from "@/lib/supabase-paging";

const org = (id: string): OrgWithAttribution => ({
  id,
  first_touch_utm_source: null,
  first_touch_utm_medium: null,
  first_touch_utm_campaign: null,
  first_touch_ref: null,
  created_by: `u-${id}`,
  owner_id: null,
});

describe("computeWardFirstEvents", () => {
  it("counts a ward from its earliest sheet that has a session", () => {
    const wards = computeWardFirstEvents({
      orgs: [org("o1"), org("o2")],
      campaigns: [
        { id: "c1", organization_id: "o1", created_at: "2026-10-15T10:00:00Z" },
        { id: "c2", organization_id: "o1", created_at: "2026-10-05T10:00:00Z" },
        { id: "c3", organization_id: "o1", created_at: "2026-09-01T10:00:00Z" }, // no sessions
        { id: "c4", organization_id: "o2", created_at: "2026-10-01T10:00:00Z" }, // no sessions
      ],
      campaignsWithSessions: new Set(["c1", "c2"]),
      teamSheets: new Set(),
    });
    expect([...wards.keys()]).toEqual(["o1"]);
    expect(wards.get("o1")!.date).toBe("2026-10-05T10:00:00Z");
  });

  it("skips team sheets and sheets whose org is missing", () => {
    const wards = computeWardFirstEvents({
      orgs: [org("o1"), org("o2")],
      campaigns: [
        { id: "c1", organization_id: "o1", created_at: "2026-10-01T10:00:00Z" },
        { id: "c2", organization_id: "o2", created_at: "2026-10-01T10:00:00Z" },
        { id: "c3", organization_id: "gone", created_at: "2026-10-01T10:00:00Z" },
        { id: "c4", organization_id: null, created_at: "2026-10-01T10:00:00Z" },
      ],
      campaignsWithSessions: new Set(["c1", "c2", "c3", "c4"]),
      teamSheets: new Set(["c2"]),
    });
    expect([...wards.keys()]).toEqual(["o1"]);
  });

  it("counts every ward when sessions span more than 1,000 rows (paged)", async () => {
    // 71 sheets in 71 wards, 2,881 sessions in campaign order: the first 1,000 rows
    // only reach the first few sheets, like the bug that showed 16 instead of 50.
    const orgs = Array.from({ length: 71 }, (_, i) => org(`o${i}`));
    const campaigns = orgs.map((o, i) => ({
      id: `c${i}`,
      organization_id: o.id,
      created_at: `2026-${i < 20 ? "10" : "09"}-01T12:00:00Z`,
    }));
    const sessions: { id: string; campaign_id: string }[] = [];
    for (let i = 0; i < 2881; i += 1) {
      sessions.push({ id: `s${i}`, campaign_id: `c${Math.floor((i * 71) / 2881)}` });
    }
    const build = () => {
      const q = {
        order: () => q,
        range: async (from: number, to: number) => ({
          data: sessions.slice(from, Math.min(to + 1, from + SUPABASE_PAGE_SIZE)),
          error: null,
        }),
      };
      return q;
    };

    const unpaged = new Set(sessions.slice(0, 1000).map((s) => s.campaign_id));
    const truncated = computeWardFirstEvents({
      orgs,
      campaigns,
      campaignsWithSessions: unpaged,
      teamSheets: new Set(),
    });
    expect(truncated.size).toBeLessThan(71);

    const rows = await fetchAllRows<{ campaign_id: string }>(build, { label: "sessions" });
    expect(rows).toHaveLength(2881);
    const wards = computeWardFirstEvents({
      orgs,
      campaigns,
      campaignsWithSessions: new Set(rows.map((r) => r.campaign_id)),
      teamSheets: new Set(),
    });
    expect(wards.size).toBe(71);
    expect([...wards.values()].filter((w) => w.date.startsWith("2026-10")).length).toBe(20);
  });
});
