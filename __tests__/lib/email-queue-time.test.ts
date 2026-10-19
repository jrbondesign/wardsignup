import {
  deferEnabled,
  deferSendWindowHours,
  inPostResetWindow,
  isRealtimeKind,
  nextResetSendAfter,
} from "@/lib/email-queue-time";

it("near real time kinds", () => {
  for (const k of ["welcome", "new_creator", "feedback_response"]) expect(isRealtimeKind(k)).toBe(true);
  for (const k of ["digest", "feedback", "feedback_summary", "other", "", null, undefined]) expect(isRealtimeKind(k)).toBe(false);
});

describe("email queue timing (Arizona day)", () => {
  it("defaults to a 6 hour send window after Arizona midnight", () => {
    expect(deferSendWindowHours({})).toBe(6);
    expect(deferSendWindowHours({ EMAIL_DEFER_SEND_WINDOW_HOURS: "2" })).toBe(2);
  });
  it("knows when it is early in the Arizona day", () => {
    // 12:05 AM Arizona
    expect(inPostResetWindow(new Date("2026-10-12T07:05:00Z"), 6)).toBe(true);
    // 5:05 AM Arizona (digest time)
    expect(inPostResetWindow(new Date("2026-10-12T12:05:00Z"), 6)).toBe(true);
    // 6:00 AM Arizona, window closed
    expect(inPostResetWindow(new Date("2026-10-12T13:00:00Z"), 6)).toBe(false);
    // 5:05 PM Arizona, which used to be the reset, is no longer early
    expect(inPostResetWindow(new Date("2026-10-13T00:05:00Z"), 6)).toBe(false);
    // 11:59 PM Arizona
    expect(inPostResetWindow(new Date("2026-10-13T06:59:00Z"), 6)).toBe(false);
  });
  it("queues until 12:05 AM Arizona the next Arizona day", () => {
    // 8:09 AM Arizona Oct 11 -> 12:05 AM Arizona Oct 12
    expect(nextResetSendAfter(new Date("2026-10-11T15:09:00Z")).toISOString()).toBe(
      "2026-10-12T07:05:00.000Z",
    );
    // 6:30 PM Arizona Oct 11 (already Oct 12 in UTC) -> still Oct 12 Arizona midnight
    expect(nextResetSendAfter(new Date("2026-10-12T01:30:00Z")).toISOString()).toBe(
      "2026-10-12T07:05:00.000Z",
    );
    // 11:59 PM Arizona Dec 31 -> Jan 1
    expect(nextResetSendAfter(new Date("2027-01-01T06:59:00Z")).toISOString()).toBe(
      "2027-01-01T07:05:00.000Z",
    );
    // right at Arizona midnight -> the following night
    expect(nextResetSendAfter(new Date("2026-10-12T07:00:00Z")).toISOString()).toBe(
      "2026-10-13T07:05:00.000Z",
    );
  });
  it("can be turned off", () => {
    expect(deferEnabled({})).toBe(true);
    expect(deferEnabled({ EMAIL_DEFER_NON_URGENT: "off" })).toBe(false);
  });
});
