import { describe, it, expect } from "@jest/globals";
import {
  buildChartTooltip,
  formatTooltipValue,
  isCurrentPhoenixWeek,
  tooltipAriaLabel,
} from "@/lib/chart-tooltip";
import { formatWeekRange } from "@/lib/metrics-weeks";

describe("week range formatting (Phoenix, Monday to Sunday)", () => {
  it("formats a Monday key as Monday to Sunday with 'to'", () => {
    expect(formatWeekRange("2026-10-12")).toBe("Oct 12 to Oct 18");
    expect(formatWeekRange("2026-10-19")).toBe("Oct 19 to Oct 25");
  });
  it("crosses month and year boundaries", () => {
    expect(formatWeekRange("2026-09-28")).toBe("Sep 28 to Oct 4");
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28 to Jan 3");
  });
  it("has no dashes", () => {
    expect(formatWeekRange("2026-10-12")).not.toMatch(/[-–—]/);
  });
});

describe("current week flag", () => {
  it("Sunday 11:59 PM Phoenix is still the old week; Monday 12:00 AM starts the new one", () => {
    // Phoenix is UTC-7 all year.
    expect(isCurrentPhoenixWeek("2026-10-12", "2026-10-19T06:59:59Z")).toBe(true);
    expect(isCurrentPhoenixWeek("2026-10-19", "2026-10-19T06:59:59Z")).toBe(false);
    expect(isCurrentPhoenixWeek("2026-10-19", "2026-10-19T07:00:00Z")).toBe(true);
    expect(isCurrentPhoenixWeek("2026-10-12", "2026-10-19T07:00:00Z")).toBe(false);
  });
  it("late Sunday evening Phoenix (already Monday in UTC) is still the old week", () => {
    expect(isCurrentPhoenixWeek("2026-10-12", "2026-10-19T05:30:00Z")).toBe(true);
  });
});

describe("tooltip values", () => {
  it("formats counts and rates exactly", () => {
    expect(formatTooltipValue(1234)).toBe("1,234");
    expect(formatTooltipValue(0)).toBe("0");
    expect(formatTooltipValue(70.25, "rate")).toBe("70.3%");
    expect(formatTooltipValue(null)).toBe("n/a");
    expect(formatTooltipValue(undefined, "rate")).toBe("n/a");
  });
});

describe("buildChartTooltip", () => {
  const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"];
  const now = "2026-10-20T05:00:00Z"; // Monday Oct 19, 10 PM Phoenix

  it("wards: new wards and running total, current week in progress", () => {
    const t = buildChartTooltip({
      weeks,
      index: 2,
      now,
      series: [
        { label: "New wards", values: [4, 6, 3] },
        { label: "Total wards", values: [41, 47, 50] },
      ],
    });
    expect(t).toEqual({
      range: "Oct 19 to Oct 25",
      inProgress: true,
      rows: [
        { label: "New wards", value: "3" },
        { label: "Total wards", value: "50" },
      ],
    });
    expect(tooltipAriaLabel(t)).toBe("Oct 19 to Oct 25, in progress. New wards: 3. Total wards: 50.");
  });

  it("past weeks are not in progress", () => {
    const t = buildChartTooltip({ weeks, index: 1, now, series: [{ label: "Signups", values: [1, 2, 3] }] });
    expect(t.range).toBe("Oct 12 to Oct 18");
    expect(t.inProgress).toBe(false);
    expect(tooltipAriaLabel(t)).toBe("Oct 12 to Oct 18. Signups: 2.");
  });

  it("capture rate shows the rate, its detail and the 70% goal", () => {
    const t = buildChartTooltip({
      weeks,
      index: 1,
      now,
      series: [{ label: "Capture rate", kind: "rate", values: [69.8, 70.3, null], details: ["67 of 96", "83 of 118", null] }],
      goal: { value: 70, kind: "rate" },
    });
    expect(t.rows).toEqual([
      { label: "Capture rate", value: "70.3% (83 of 118)" },
      { label: "Goal", value: "70.0%" },
    ]);
  });

  it("missing values read n/a without a detail", () => {
    const t = buildChartTooltip({
      weeks,
      index: 2,
      now,
      series: [{ label: "Capture rate", kind: "rate", values: [1, 2, null], details: [null, null, "0 of 0"] }],
    });
    expect(t.rows[0]).toEqual({ label: "Capture rate", value: "n/a" });
  });
});
