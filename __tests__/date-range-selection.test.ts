import {
  DATE_RANGE_EMPTY_FOOTER,
  DATE_RANGE_MISSING_ERROR,
  formatRangeDay,
  nextDateRange,
  rangeCompleteFooter,
  rangeStartFooter,
} from "@/lib/date-range-selection";

const d = (day: number) => new Date(2026, 10, day);

describe("nextDateRange", () => {
  it("sets the start on the first tap", () => {
    expect(nextDateRange(null, null, d(16))).toEqual({ start: d(16), end: null });
  });

  it("moves the start when the next tap is before it, and still has no end", () => {
    expect(nextDateRange(d(16), null, d(14))).toEqual({ start: d(14), end: null });
  });

  it("completes a one day range when the start is tapped again", () => {
    expect(nextDateRange(d(16), null, d(16))).toEqual({ start: d(16), end: d(16) });
  });

  it("sets the end when the next tap is after the start", () => {
    expect(nextDateRange(d(16), null, d(21))).toEqual({ start: d(16), end: d(21) });
  });

  it("moves the start and keeps the end when a complete range is tapped before the start", () => {
    expect(nextDateRange(d(16), d(21), d(14))).toEqual({ start: d(14), end: d(21) });
  });

  it("moves the end and keeps the start when a complete range is tapped after the end", () => {
    expect(nextDateRange(d(16), d(21), d(27))).toEqual({ start: d(16), end: d(27) });
  });

  it("does not reset when a day inside the range is tapped; it moves the nearer bound", () => {
    // 18 is closer to 16 than to 21
    expect(nextDateRange(d(16), d(21), d(18))).toEqual({ start: d(18), end: d(21) });
    // 20 is closer to 21
    expect(nextDateRange(d(16), d(21), d(20))).toEqual({ start: d(16), end: d(20) });
  });

  it("keeps the range when the existing start or end is tapped again", () => {
    expect(nextDateRange(d(16), d(21), d(16))).toEqual({ start: d(16), end: d(21) });
    expect(nextDateRange(d(16), d(21), d(21))).toEqual({ start: d(16), end: d(21) });
  });
});

describe("date range copy", () => {
  it("formats the start footer, complete range, and missing-range error without dashes", () => {
    expect(formatRangeDay(d(16))).toBe("Mon, Nov 16");
    expect(rangeStartFooter(d(16))).toBe("Start: Mon, Nov 16. Now tap the end date.");
    expect(rangeCompleteFooter(d(16), d(21))).toBe("Mon, Nov 16 to Sat, Nov 21");
    expect(rangeCompleteFooter(d(16), d(16))).toBe("Mon, Nov 16");
    expect(DATE_RANGE_EMPTY_FOOTER).toBe("Tap a start date");
    expect(DATE_RANGE_MISSING_ERROR).toBe("Pick a start and end date first.");

    const strings = [
      rangeStartFooter(d(16)),
      rangeCompleteFooter(d(16), d(21)),
      DATE_RANGE_EMPTY_FOOTER,
      DATE_RANGE_MISSING_ERROR,
    ];
    for (const s of strings) {
      expect(s).not.toMatch(/[—–]/);
    }
  });
});
