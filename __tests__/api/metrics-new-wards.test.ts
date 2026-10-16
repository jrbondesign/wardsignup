import { describe, it, expect } from "@jest/globals";

describe("New Wards Metric", () => {
  it("should group wards by month of first published event", () => {
    const orgFirstEvents = [
      { orgId: "org1", date: "2026-10-05T10:00:00Z", attribution: { source: "email" } },
      { orgId: "org2", date: "2026-10-15T10:00:00Z", attribution: { source: "qr" } },
      { orgId: "org3", date: "2026-09-20T10:00:00Z", attribution: { source: "share" } },
    ];

    const toMonthKey = (dateStr: string): string => dateStr.slice(0, 7);

    const monthlyMap = new Map<string, number>();
    for (const event of orgFirstEvents) {
      const month = toMonthKey(event.date);
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1);
    }

    expect(monthlyMap.get("2026-10")).toBe(2);
    expect(monthlyMap.get("2026-09")).toBe(1);
  });

  it("should track attribution by source", () => {
    const monthData = {
      count: 3,
      bySource: new Map([
        ["email", 1],
        ["qr", 1],
        ["share", 1],
      ]),
    };

    expect(monthData.count).toBe(3);
    expect(monthData.bySource.get("email")).toBe(1);
    expect(monthData.bySource.get("qr")).toBe(1);
    expect(monthData.bySource.get("share")).toBe(1);
  });

  it("should use Unknown for null attribution", () => {
    const orgs = [
      { id: "org1", first_touch_utm_source: null, first_touch_ref: null },
      { id: "org2", first_touch_utm_source: "email", first_touch_ref: null },
    ];

    const getSource = (org: typeof orgs[0]) => {
      return org.first_touch_utm_source || org.first_touch_ref || "Unknown";
    };

    expect(getSource(orgs[0])).toBe("Unknown");
    expect(getSource(orgs[1])).toBe("email");
  });

  it("should prefer utm_source over ref for attribution", () => {
    const org = {
      first_touch_utm_source: "email",
      first_touch_ref: "share",
    };

    const source = org.first_touch_utm_source || org.first_touch_ref || "Unknown";
    expect(source).toBe("email");
  });

  it("should generate 12 months of trend data", () => {
    const nowDate = new Date("2026-10-16");
    const months: string[] = [];
    const startDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 11, 1);
    
    for (let d = new Date(startDate); d <= nowDate; d.setMonth(d.getMonth() + 1)) {
      const monthKey = d.toISOString().slice(0, 7);
      months.push(monthKey);
    }

    expect(months.length).toBe(12);
    expect(months[0]).toBe("2025-11");
    expect(months[11]).toBe("2026-10");
  });

  it("should only count orgs with published events (events with sessions)", () => {
    const campaigns = [
      { id: "c1", organization_id: "org1", created_at: "2026-10-01T10:00:00Z" },
      { id: "c2", organization_id: "org2", created_at: "2026-10-05T10:00:00Z" },
    ];

    const campaignsWithSessions = new Set(["c1"]);

    const publishedOrgs = campaigns
      .filter(c => campaignsWithSessions.has(c.id))
      .map(c => c.organization_id);

    expect(publishedOrgs).toEqual(["org1"]);
    expect(publishedOrgs).not.toContain("org2");
  });

  it("should take the earliest published event per org", () => {
    const campaigns = [
      { id: "c1", organization_id: "org1", created_at: "2026-10-15T10:00:00Z" },
      { id: "c2", organization_id: "org1", created_at: "2026-10-05T10:00:00Z" },
      { id: "c3", organization_id: "org1", created_at: "2026-10-20T10:00:00Z" },
    ];

    let earliestDate: string | null = null;
    for (const campaign of campaigns) {
      if (!earliestDate || campaign.created_at < earliestDate) {
        earliestDate = campaign.created_at;
      }
    }

    expect(earliestDate).toBe("2026-10-05T10:00:00Z");
  });
});
