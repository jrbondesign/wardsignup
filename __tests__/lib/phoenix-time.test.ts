import {
  addDaysToKey,
  addWeeksToKey,
  formatPhoenixWeekRange,
  phoenixDateKey,
  phoenixDayStartUtc,
  phoenixHour,
  phoenixMonthKey,
  phoenixTimeLabel,
  phoenixWeekEndUtc,
  phoenixWeekKey,
  phoenixWeekStartUtc,
  phoenixWeekday,
} from "@/lib/phoenix-time";

describe("phoenix-time: days", () => {
  it("the Phoenix day rolls at 07:00Z, not 00:00Z", () => {
    // Sun Oct 18 2026, 5:00 PM Phoenix = Mon 00:00Z. Still Sunday in Phoenix.
    expect(phoenixDateKey("2026-10-19T00:00:00Z")).toBe("2026-10-18");
    expect(phoenixDateKey("2026-10-19T06:59:59.999Z")).toBe("2026-10-18");
    expect(phoenixDateKey("2026-10-19T07:00:00Z")).toBe("2026-10-19");
  });
  it("day start is Phoenix midnight as a UTC instant", () => {
    expect(phoenixDayStartUtc("2026-10-19T03:00:00Z").toISOString()).toBe("2026-10-18T07:00:00.000Z");
    expect(phoenixDayStartUtc("2026-10-19T07:00:00Z").toISOString()).toBe("2026-10-19T07:00:00.000Z");
  });
  it("weekday and hour read Phoenix wall time", () => {
    expect(phoenixWeekday("2026-10-19T02:00:00Z")).toBe(0); // Sun 7pm Phoenix
    expect(phoenixWeekday("2026-10-19T07:00:00Z")).toBe(1); // Mon 0:00 Phoenix
    expect(phoenixHour("2026-10-19T00:00:00Z")).toBe(17);
  });
  it("no DST: summer and winter use the same offset", () => {
    expect(phoenixDateKey("2026-07-01T06:59:00Z")).toBe("2026-06-30");
    expect(phoenixDateKey("2026-01-01T06:59:00Z")).toBe("2025-12-31");
    expect(phoenixDateKey("2026-03-08T07:00:00Z")).toBe("2026-03-08");
    expect(phoenixDateKey("2026-11-01T07:00:00Z")).toBe("2026-11-01");
  });
  it("addDaysToKey crosses months and years", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("phoenix-time: Monday to Sunday weeks", () => {
  it("Sunday 23:59:59 Phoenix is still the old week; Monday 00:00 Phoenix starts the new one", () => {
    // Sun Oct 18 23:59:59 Phoenix = Mon Oct 19 06:59:59Z
    expect(phoenixWeekKey("2026-10-19T06:59:59.999Z")).toBe("2026-10-12");
    // Mon Oct 19 00:00 Phoenix = 07:00Z
    expect(phoenixWeekKey("2026-10-19T07:00:00Z")).toBe("2026-10-19");
  });
  it("Sunday 5pm Phoenix (the UTC rollover) does not start a new week", () => {
    expect(phoenixWeekKey("2026-10-19T00:00:00Z")).toBe("2026-10-12");
  });
  it("Monday early morning UTC is still Sunday in Phoenix", () => {
    expect(phoenixWeekKey("2026-10-12T06:59:00Z")).toBe("2026-10-05");
    expect(phoenixWeekKey("2026-10-12T07:00:00Z")).toBe("2026-10-12");
  });
  it("week start and exclusive end", () => {
    expect(phoenixWeekStartUtc("2026-10-15T12:00:00Z").toISOString()).toBe("2026-10-12T07:00:00.000Z");
    expect(phoenixWeekEndUtc("2026-10-15T12:00:00Z").toISOString()).toBe("2026-10-19T07:00:00.000Z");
  });
  it("week across a month and year boundary", () => {
    expect(phoenixWeekKey("2027-01-01T12:00:00Z")).toBe("2026-12-28");
    expect(addWeeksToKey("2026-12-28", 1)).toBe("2027-01-04");
  });
  it("labels show Monday to Sunday dates", () => {
    expect(formatPhoenixWeekRange("2026-10-12")).toBe("Oct 12 to Oct 18");
    expect(formatPhoenixWeekRange("2026-09-28")).toBe("Sep 28 to Oct 4");
  });
  it("month key uses the Phoenix date", () => {
    expect(phoenixMonthKey("2026-10-01T06:00:00Z")).toBe("2026-09");
    expect(phoenixMonthKey("2026-10-01T07:00:00Z")).toBe("2026-10");
  });
});

describe("phoenixTimeLabel", () => {
  it("converts UTC cron times", () => {
    expect(phoenixTimeLabel(15)).toBe("8:00 AM Phoenix");
    expect(phoenixTimeLabel(0, 5)).toBe("5:05 PM Phoenix");
    expect(phoenixTimeLabel(7)).toBe("12:00 AM Phoenix");
    expect(phoenixTimeLabel(19)).toBe("12:00 PM Phoenix");
  });
});
