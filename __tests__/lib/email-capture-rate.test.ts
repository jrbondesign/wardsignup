import { computeEmailCaptureRate, emailCaptureWindowStart, phoenixWeekStartUtc } from "@/lib/email-capture-rate";

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
});
