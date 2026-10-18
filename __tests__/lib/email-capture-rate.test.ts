import {
  computeEmailCaptureRate,
  emailCaptureWindowStart,
  phoenixWeekStartUtc,
  pooledRate,
  testCampaignIds,
} from "@/lib/email-capture-rate";

// Sunday Oct 18 2026, 11:00 AM Phoenix
const NOW = new Date("2026-10-18T18:00:00Z");

describe("email capture rate", () => {
  it("uses Monday midnight Phoenix week starts", () => {
    expect(phoenixWeekStartUtc(NOW).toISOString()).toBe("2026-10-12T07:00:00.000Z");
    // Sunday 11:30 PM Phoenix still belongs to the prior week
    expect(phoenixWeekStartUtc(new Date("2026-10-12T06:30:00Z")).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(emailCaptureWindowStart(NOW, 8).toISOString()).toBe("2026-08-17T07:00:00.000Z");
  });

  it("buckets signups and counts only non empty emails", () => {
    const r = computeEmailCaptureRate(
      [
        { signed_up_at: "2026-10-12T07:00:00Z", member_email: "a@x.com" }, // this week
        { signed_up_at: "2026-10-17T20:00:00Z", member_email: null }, // this week
        { signed_up_at: "2026-10-12T06:59:59Z", member_email: "b@x.com" }, // last week (Sun night Phoenix)
        { signed_up_at: "2026-10-06T15:00:00Z", member_email: "  " }, // last week, blank
        { signed_up_at: "2026-10-07T15:00:00Z", member_email: "c@x.com" }, // last week
        { signed_up_at: "2026-08-17T06:00:00Z", member_email: "old@x.com" }, // before window
      ],
      NOW,
      8,
    );
    expect(r.completedWeeks).toHaveLength(8);
    expect(r.completedWeeks[0]!.weekStart).toBe("2026-08-17");
    expect(r.thisWeek).toEqual({ weekStart: "2026-10-12", total: 2, withEmail: 1, ratePct: 50 });
    expect(r.completedWeeks[7]).toEqual({ weekStart: "2026-10-05", total: 3, withEmail: 2, ratePct: 66.7 });
    expect(r.completedWeeks[0]).toEqual({ weekStart: "2026-08-17", total: 0, withEmail: 0, ratePct: null });
  });

  it("pools the last 4 completed weeks (sum with email / sum signups)", () => {
    const weeks = [
      { weekStart: "2026-09-07", total: 100, withEmail: 0, ratePct: 0 },
      { weekStart: "2026-09-14", total: 10, withEmail: 10, ratePct: 100 },
      { weekStart: "2026-09-21", total: 30, withEmail: 15, ratePct: 50 },
      { weekStart: "2026-09-28", total: 0, withEmail: 0, ratePct: null },
      { weekStart: "2026-10-05", total: 60, withEmail: 30, ratePct: 50 },
    ];
    expect(pooledRate(weeks, 4)).toEqual({ weeks: 4, total: 100, withEmail: 55, ratePct: 55 });
    expect(pooledRate([], 4)).toEqual({ weeks: 0, total: 0, withEmail: 0, ratePct: null });

    const r = computeEmailCaptureRate(
      [
        { signed_up_at: "2026-10-06T15:00:00Z", member_email: "a@x.com" }, // week of Oct 5
        { signed_up_at: "2026-09-22T15:00:00Z", member_email: null }, // week of Sep 21
        { signed_up_at: "2026-09-08T15:00:00Z", member_email: null }, // week of Sep 7, outside 4 weeks
        { signed_up_at: "2026-10-13T15:00:00Z", member_email: null }, // this week, not pooled
      ],
      NOW,
      8,
    );
    expect(r.rolling4Week).toEqual({ weeks: 4, total: 2, withEmail: 1, ratePct: 50 });
  });

  it("excludes signups on test and team campaigns", () => {
    const skip = new Set(["jonathan@wardsignup.com", "bondesign@gmail.com"]);
    const excluded = testCampaignIds({
      campaigns: [
        { id: "c-real", created_by: "u-real", user_email: "real@x.com", organization_id: "o-real" },
        { id: "c-owner", created_by: "u-real", user_email: null, organization_id: "o-test" },
        { id: "c-creator", created_by: "u-test", user_email: null, organization_id: null },
        { id: "c-email", created_by: null, user_email: " BonDesign@gmail.com ", organization_id: null },
      ],
      orgOwnerById: new Map([["o-real", "u-real"], ["o-test", "u-test"]]),
      emailByUserId: new Map([["u-real", "real@x.com"], ["u-test", "Jonathan@WardSignup.com"]]),
      skipEmails: skip,
    });
    expect([...excluded].sort()).toEqual(["c-creator", "c-email", "c-owner"]);

    const r = computeEmailCaptureRate(
      [
        { signed_up_at: "2026-10-06T15:00:00Z", member_email: null, campaign_id: "c-real" },
        { signed_up_at: "2026-10-06T16:00:00Z", member_email: "t@x.com", campaign_id: "c-owner" },
        { signed_up_at: "2026-10-06T17:00:00Z", member_email: "t@x.com", campaign_id: "c-email" },
      ],
      NOW,
      8,
      excluded,
    );
    expect(r.completedWeeks[7]).toEqual({ weekStart: "2026-10-05", total: 1, withEmail: 0, ratePct: 0 });
  });
});
