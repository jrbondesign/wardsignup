import {
  deferEnabled,
  deferSendWindowHours,
  inPostResetWindow,
  nextResetSendAfter,
} from "@/lib/email-queue-time";

describe("email queue timing", () => {
  it("defaults to a 6 hour send window after 00:00 UTC", () => {
    expect(deferSendWindowHours({})).toBe(6);
    expect(deferSendWindowHours({ EMAIL_DEFER_SEND_WINDOW_HOURS: "2" })).toBe(2);
  });
  it("knows when it is early in the UTC day", () => {
    expect(inPostResetWindow(new Date("2026-10-12T00:05:00Z"), 6)).toBe(true);
    expect(inPostResetWindow(new Date("2026-10-11T15:09:00Z"), 6)).toBe(false);
  });
  it("queues until 00:05 UTC the next day (5:05pm Phoenix)", () => {
    expect(nextResetSendAfter(new Date("2026-10-11T15:09:00Z")).toISOString()).toBe(
      "2026-10-12T00:05:00.000Z",
    );
    expect(nextResetSendAfter(new Date("2026-12-31T23:59:00Z")).toISOString()).toBe(
      "2027-01-01T00:05:00.000Z",
    );
  });
  it("can be turned off", () => {
    expect(deferEnabled({})).toBe(true);
    expect(deferEnabled({ EMAIL_DEFER_NON_URGENT: "off" })).toBe(false);
  });
});
