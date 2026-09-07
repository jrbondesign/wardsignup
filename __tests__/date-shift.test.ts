import { diffDays, earliestYmd, isYmd, shiftNullableYmd, shiftYmd } from "@/lib/date-shift";

describe("date-shift", () => {
  describe("isYmd", () => {
    it("accepts valid dates and rejects junk", () => {
      expect(isYmd("2026-07-14")).toBe(true);
      expect(isYmd("2026-7-14")).toBe(false);
      expect(isYmd("not-a-date")).toBe(false);
      expect(isYmd(null)).toBe(false);
      expect(isYmd(20260714)).toBe(false);
    });
  });

  describe("shiftYmd", () => {
    it("shifts forward and backward", () => {
      expect(shiftYmd("2026-07-14", 7)).toBe("2026-07-21");
      expect(shiftYmd("2026-07-14", -14)).toBe("2026-06-30");
      expect(shiftYmd("2026-07-14", 0)).toBe("2026-07-14");
    });

    it("crosses month and year boundaries", () => {
      expect(shiftYmd("2026-12-31", 1)).toBe("2027-01-01");
      expect(shiftYmd("2026-01-01", -1)).toBe("2025-12-31");
    });

    it("handles leap day arithmetic", () => {
      expect(shiftYmd("2028-02-28", 1)).toBe("2028-02-29");
      expect(shiftYmd("2028-02-28", 2)).toBe("2028-03-01");
    });

    it("returns malformed input unchanged", () => {
      expect(shiftYmd("garbage", 5)).toBe("garbage");
    });
  });

  describe("diffDays", () => {
    it("computes whole-day deltas", () => {
      expect(diffDays("2026-07-14", "2026-07-21")).toBe(7);
      expect(diffDays("2026-07-21", "2026-07-14")).toBe(-7);
      expect(diffDays("2026-07-14", "2026-07-14")).toBe(0);
    });

    it("returns null on malformed input", () => {
      expect(diffDays("2026-07-14", "nope")).toBeNull();
      expect(diffDays("nope", "2026-07-14")).toBeNull();
    });
  });

  describe("shiftNullableYmd", () => {
    it("passes through null/blank and shifts valid dates", () => {
      expect(shiftNullableYmd(null, 5)).toBeNull();
      expect(shiftNullableYmd("", 5)).toBeNull();
      expect(shiftNullableYmd("2026-07-14", 5)).toBe("2026-07-19");
    });
  });

  describe("earliestYmd", () => {
    it("returns the chronologically earliest valid date", () => {
      expect(earliestYmd(["2026-07-21", "2026-07-14", "2026-08-01"])).toBe("2026-07-14");
    });

    it("ignores invalid/null entries", () => {
      expect(earliestYmd([null, "junk", "2026-07-14", undefined])).toBe("2026-07-14");
    });

    it("returns null when nothing valid", () => {
      expect(earliestYmd([null, "junk", undefined])).toBeNull();
    });
  });
});
