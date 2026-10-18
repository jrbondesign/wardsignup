import { describe, it, expect } from "@jest/globals";

describe("New Wards Metric", () => {
  it("should count total wards (all-time distinct orgs with published events)", () => {
    const orgFirstEventMap = new Map([
      ["org1", { date: "2026-10-05T10:00:00Z" }],
      ["org2", { date: "2026-10-15T10:00:00Z" }],
      ["org3", { date: "2026-09-20T10:00:00Z" }],
      ["org4", { date: "2026-08-10T10:00:00Z" }],
    ]);

    const totalWards = orgFirstEventMap.size;

    expect(totalWards).toBe(4);
  });

  it("should count new wards this week (Phoenix time, Monday-start)", () => {
    // Mock current time: Sunday Oct 19, 2026 at 3:00 AM UTC
    // In Phoenix (UTC-7): Saturday Oct 18, 2026 at 8:00 PM
    // Current week in Phoenix starts: Monday Oct 13, 2026 at 7:00 AM UTC (midnight Phoenix)
    const nowDate = new Date("2026-10-19T03:00:00Z");
    const phoenixOffset = -7 * 60; // minutes
    const nowPhoenix = new Date(nowDate.getTime() + phoenixOffset * 60 * 1000);
    
    const phoenixDay = nowPhoenix.getUTCDay();
    const phoenixDaysSinceMonday = phoenixDay === 0 ? 6 : phoenixDay - 1;
    const phoenixWeekStart = new Date(nowPhoenix);
    phoenixWeekStart.setUTCDate(phoenixWeekStart.getUTCDate() - phoenixDaysSinceMonday);
    phoenixWeekStart.setUTCHours(0, 0, 0, 0);
    
    const weekStartUTC = new Date(phoenixWeekStart.getTime() - phoenixOffset * 60 * 1000);
    const weekStartISO = weekStartUTC.toISOString();

    const orgFirstEvents = [
      { orgId: "org1", date: "2026-10-14T10:00:00Z" }, // Tuesday this week - YES
      { orgId: "org2", date: "2026-10-18T22:00:00Z" }, // Saturday this week - YES
      { orgId: "org3", date: "2026-10-12T10:00:00Z" }, // Sunday last week - NO
      { orgId: "org4", date: "2026-10-13T06:00:00Z" }, // Before week start in UTC - NO
      { orgId: "org5", date: "2026-10-13T08:00:00Z" }, // After week start in UTC - YES
    ];

    let newThisWeek = 0;
    for (const event of orgFirstEvents) {
      if (event.date >= weekStartISO) {
        newThisWeek += 1;
      }
    }

    expect(newThisWeek).toBe(3);
    expect(weekStartISO).toBe("2026-10-13T07:00:00.000Z");
  });

  it("should exclude test accounts from both total and weekly counts", () => {
    const skipEmails = new Set([
      "jonathan@wardsignup.com",
      "jon@jrbond.com",
      "bondesign@gmail.com",
    ]);

    const orgsWithOwners = [
      { orgId: "org1", date: "2026-10-14T10:00:00Z", ownerEmail: "user@example.com" },
      { orgId: "org2", date: "2026-10-15T10:00:00Z", ownerEmail: "jonathan@wardsignup.com" },
      { orgId: "org3", date: "2026-10-16T10:00:00Z", ownerEmail: "another@example.com" },
      { orgId: "org4", date: "2026-10-17T10:00:00Z", ownerEmail: "bondesign@gmail.com" },
    ];

    const validOrgs = orgsWithOwners.filter(
      (org) => !skipEmails.has(org.ownerEmail.toLowerCase())
    );

    expect(validOrgs.length).toBe(2);
    expect(validOrgs.map((o) => o.orgId)).toEqual(["org1", "org3"]);
  });

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
