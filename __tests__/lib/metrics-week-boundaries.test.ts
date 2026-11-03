import { computeEmailCaptureRate } from "@/lib/email-capture-rate";
import { lastWeekKeys } from "@/lib/core-metrics";
import { formatWeekRange, phoenixWeekKey, phoenixWeekStartUtc } from "@/lib/metrics-weeks";

// Sun Oct 18 2026 23:59:59 Phoenix = Mon Oct 19 06:59:59Z; Mon Oct 19 00:00 Phoenix = 07:00Z.
const SUN_2359 = "2026-10-19T06:59:59Z";
const MON_0000 = "2026-10-19T07:00:00Z";

describe("founder metrics week = Monday 00:00 to Sunday 23:59:59 Phoenix", () => {
  it("Sunday 23:59 Phoenix belongs to the week of Oct 12; Monday 00:00 starts Oct 19", () => {
    expect(phoenixWeekKey(SUN_2359)).toBe("2026-10-12");
    expect(phoenixWeekKey(MON_0000)).toBe("2026-10-19");
    expect(phoenixWeekStartUtc(new Date(SUN_2359)).toISOString()).toBe("2026-10-12T07:00:00.000Z");
  });

  it("Sunday 5 PM Phoenix (UTC midnight) is not a new week", () => {
    expect(phoenixWeekKey("2026-10-19T00:00:00Z")).toBe("2026-10-12");
  });

  it("week labels show Monday to Sunday dates", () => {
    expect(formatWeekRange("2026-10-12")).toBe("Oct 12 to Oct 18");
    expect(formatWeekRange("2026-10-19")).toBe("Oct 19 to Oct 25");
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28 to Jan 3");
  });

  it("the 12 week window ends on this week and steps by Mondays", () => {
    const keys = lastWeekKeys(phoenixWeekKey(MON_0000), 12);
    expect(keys).toHaveLength(12);
    expect(keys[11]).toBe("2026-10-19");
    expect(keys[10]).toBe("2026-10-12");
    expect(keys[0]).toBe("2026-08-03");
  });

  it("email capture: a Sunday 23:59 signup counts in last week, Monday 00:00 in this week", () => {
    const rows = [
      { signed_up_at: SUN_2359, member_email: "a@b.co" },
      { signed_up_at: MON_0000, member_email: null },
      { signed_up_at: "2026-10-12T07:00:00Z", member_email: "c@d.co" }, // Mon Oct 12 00:00 Phoenix
      { signed_up_at: "2026-10-12T06:59:59Z", member_email: null }, // Sun Oct 11 23:59:59 Phoenix
    ];
    // "now" is Monday Oct 19, 9 AM Phoenix
    const r = computeEmailCaptureRate(rows, new Date("2026-10-19T16:00:00Z"), 2);
    expect(r.thisWeek).toMatchObject({ weekStart: "2026-10-19", total: 1, withEmail: 0 });
    const last = r.completedWeeks[r.completedWeeks.length - 1]!;
    expect(last).toMatchObject({ weekStart: "2026-10-12", total: 2, withEmail: 2, ratePct: 100 });
    const before = r.completedWeeks[r.completedWeeks.length - 2]!;
    expect(before).toMatchObject({ weekStart: "2026-10-05", total: 1, withEmail: 0 });
  });

  it("email capture: on Sunday 23:59 Phoenix the current week is still Oct 12", () => {
    const r = computeEmailCaptureRate([{ signed_up_at: SUN_2359, member_email: "a@b.co" }], new Date(SUN_2359), 1);
    expect(r.thisWeek).toMatchObject({ weekStart: "2026-10-12", total: 1, withEmail: 1 });
  });
});
