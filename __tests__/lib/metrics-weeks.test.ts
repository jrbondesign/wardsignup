import { describe, it, expect } from "@jest/globals";
import {
  addMonths,
  formatMonthLabel,
  formatWeekRange,
  phoenixMonthKey,
  phoenixWeekKey,
  phoenixWeekKeyToUtc,
  phoenixWeekRange,
  trendDirection,
  TREND_ARROW,
} from "@/lib/metrics-weeks";

describe("Phoenix Monday to Sunday weeks", () => {
  it("Sunday 5:30 PM Phoenix (after UTC midnight Monday) is still the old week", () => {
    // 2026-10-19T00:30Z is Sun Oct 18 5:30 PM in Phoenix. The old UTC week key rolled to Oct 19.
    expect(phoenixWeekKey("2026-10-19T00:30:00Z")).toBe("2026-10-12");
  });

  it("Sunday 11:59 PM Phoenix belongs to the week that started Monday", () => {
    expect(phoenixWeekKey("2026-10-19T06:59:59.999Z")).toBe("2026-10-12");
  });

  it("Monday 12:00 AM Phoenix starts the next week", () => {
    expect(phoenixWeekKey("2026-10-19T07:00:00Z")).toBe("2026-10-19");
  });

  it("Monday 6:59 AM UTC (Sunday night in Phoenix) is the prior week", () => {
    expect(phoenixWeekKey("2026-10-12T06:59:00Z")).toBe("2026-10-05");
    expect(phoenixWeekKey("2026-10-12T07:00:00Z")).toBe("2026-10-12");
  });

  it("week key maps back to Phoenix midnight in UTC", () => {
    expect(phoenixWeekKeyToUtc("2026-10-12").toISOString()).toBe("2026-10-12T07:00:00.000Z");
  });

  it("ranges step a week at a time, across a month boundary", () => {
    expect(phoenixWeekRange("2026-09-21T12:00:00Z", "2026-10-18T20:00:00Z")).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
  });

  it("labels weeks without dashes", () => {
    expect(formatWeekRange("2026-10-12", "en-US")).toBe("Oct 12 to Oct 18");
    expect(formatWeekRange("2026-09-28", "en-US")).toBe("Sep 28 to Oct 4");
  });
});

describe("month keys and labels", () => {
  it("Phoenix month: Oct 1 at 3 AM UTC is still September in Phoenix", () => {
    expect(phoenixMonthKey("2026-10-01T03:00:00Z")).toBe("2026-09");
    expect(phoenixMonthKey("2026-10-01T07:00:00Z")).toBe("2026-10");
  });

  it("addMonths crosses years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-10", -11)).toBe("2025-11");
  });

  it("month label does not slip a month in a negative offset time zone", () => {
    // The old code did new Date("2026-10-01").toLocaleDateString(...) which shows "Sep 2026" in Phoenix.
    const buggy = new Date("2026-10-01").toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "America/Phoenix",
    });
    expect(buggy).toBe("Sep 2026");
    expect(formatMonthLabel("2026-10", "en-US")).toBe("Oct 2026");
    expect(formatMonthLabel("2026-01", "en-US")).toBe("Jan 2026");
  });
});

describe("trend arrow thresholds", () => {
  it("within ±3% is flat, inclusive", () => {
    expect(trendDirection(103, 100)).toBe("flat");
    expect(trendDirection(97, 100)).toBe("flat");
    expect(trendDirection(100, 100)).toBe("flat");
  });

  it("just past 3% moves", () => {
    expect(trendDirection(103.1, 100)).toBe("up");
    expect(trendDirection(96.9, 100)).toBe("down");
  });

  it("matches the spec examples", () => {
    expect(trendDirection(368, 422)).toBe("down"); // visitors, -13%
    expect(trendDirection(118, 96)).toBe("up"); // signups, +23%
    expect(trendDirection(70.3, 69.8)).toBe("flat"); // email capture, +0.5 pts
  });

  it("handles zero and missing bases", () => {
    expect(trendDirection(5, 0)).toBe("up");
    expect(trendDirection(0, 0)).toBe("flat");
    expect(trendDirection(null, 4)).toBe("flat");
    expect(trendDirection(4, undefined)).toBe("flat");
  });

  it("maps to the arrows", () => {
    expect(TREND_ARROW).toEqual({ up: "▲", down: "▼", flat: "▬" });
  });
});
