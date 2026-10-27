import {
  CALLING_MAX_LENGTH,
  CALLING_OPTIONS,
  CALLING_OTHER,
  joinCalling,
  normalizeCalling,
  splitCalling,
} from "@/lib/callings";

describe("callings", () => {
  it("lists the common callings without dashes or the word unit", () => {
    expect(CALLING_OPTIONS).toContain("Executive secretary");
    expect(CALLING_OPTIONS).toContain("Bishop");
    expect(CALLING_OPTIONS).toContain("Relief Society president");
    for (const option of CALLING_OPTIONS) {
      expect(option).not.toMatch(/[-–—]/);
      expect(option.toLowerCase()).not.toContain("unit");
    }
  });

  it("normalizes whitespace, blanks and length", () => {
    expect(normalizeCalling("  Stake   clerk ")).toBe("Stake clerk");
    expect(normalizeCalling("   ")).toBeNull();
    expect(normalizeCalling(null)).toBeNull();
    expect(normalizeCalling(42)).toBeNull();
    expect(normalizeCalling("x".repeat(200))).toHaveLength(CALLING_MAX_LENGTH);
  });

  it("round trips picklist and Other values", () => {
    expect(joinCalling("Bishop", "")).toBe("Bishop");
    expect(joinCalling(CALLING_OTHER, " Stake clerk ")).toBe("Stake clerk");
    expect(joinCalling(CALLING_OTHER, "  ")).toBeNull();
    expect(joinCalling("", "ignored")).toBeNull();

    expect(splitCalling("bishop")).toEqual({ choice: "Bishop", otherText: "" });
    expect(splitCalling("Stake clerk")).toEqual({ choice: CALLING_OTHER, otherText: "Stake clerk" });
    expect(splitCalling(null)).toEqual({ choice: "", otherText: "" });
  });
});
