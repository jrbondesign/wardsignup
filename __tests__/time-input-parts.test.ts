import { hhmmToParts, partsToHhmm } from "@/components/TimeInput";

describe("hhmmToParts", () => {
  it("maps midnight to 12 AM", () => {
    expect(hhmmToParts("00:00")).toEqual({ hour12: "12", minute: "00", meridiem: "AM" });
  });
  it("maps noon to 12 PM", () => {
    expect(hhmmToParts("12:00")).toEqual({ hour12: "12", minute: "00", meridiem: "PM" });
  });
  it("maps afternoon times", () => {
    expect(hhmmToParts("16:30")).toEqual({ hour12: "4", minute: "30", meridiem: "PM" });
  });
  it("maps morning times", () => {
    expect(hhmmToParts("09:05")).toEqual({ hour12: "9", minute: "05", meridiem: "AM" });
  });
  it("treats empty as blank parts", () => {
    expect(hhmmToParts("")).toEqual({ hour12: "", minute: "", meridiem: "AM" });
  });
});

describe("partsToHhmm", () => {
  it("12 AM → 00:xx", () => {
    expect(partsToHhmm("12", "00", "AM")).toBe("00:00");
    expect(partsToHhmm("12", "15", "AM")).toBe("00:15");
  });
  it("12 PM → 12:xx", () => {
    expect(partsToHhmm("12", "00", "PM")).toBe("12:00");
    expect(partsToHhmm("12", "45", "PM")).toBe("12:45");
  });
  it("converts typical times", () => {
    expect(partsToHhmm("4", "30", "PM")).toBe("16:30");
    expect(partsToHhmm("9", "05", "AM")).toBe("09:05");
    expect(partsToHhmm("11", "59", "PM")).toBe("23:59");
  });
  it("returns empty when hour or minute blank", () => {
    expect(partsToHhmm("", "30", "PM")).toBe("");
    expect(partsToHhmm("4", "", "PM")).toBe("");
  });
  it("round trips through hhmmToParts", () => {
    for (const t of ["00:00", "00:30", "11:59", "12:00", "12:01", "13:00", "23:59"]) {
      const p = hhmmToParts(t);
      expect(partsToHhmm(p.hour12, p.minute, p.meridiem)).toBe(t);
    }
  });
});
