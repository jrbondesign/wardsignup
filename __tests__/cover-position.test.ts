/**
 * @jest-environment node
 */
import {
  coverObjectPosition,
  formatCoverPosition,
  isValidCoverPosition,
  parseCoverPosition,
} from "@/lib/cover-position";

describe("cover position", () => {
  it("validates the stored format", () => {
    expect(isValidCoverPosition("50% 30%")).toBe(true);
    expect(isValidCoverPosition("0% 100%")).toBe(true);
    expect(isValidCoverPosition("101% 0%")).toBe(false);
    expect(isValidCoverPosition("50% 30%; color: red")).toBe(false);
    expect(isValidCoverPosition(null)).toBe(false);
  });

  it("clamps and rounds when formatting", () => {
    expect(formatCoverPosition(-10, 120.4)).toBe("0% 100%");
    expect(formatCoverPosition(33.6, 66.4)).toBe("34% 66%");
  });

  it("falls back to centered for missing or bad values", () => {
    expect(parseCoverPosition(null)).toEqual({ x: 50, y: 50 });
    expect(coverObjectPosition("evil")).toBe("50% 50%");
    expect(parseCoverPosition("20% 80%")).toEqual({ x: 20, y: 80 });
  });
});
