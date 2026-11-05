/**
 * Leftover event_end_date after switching a multi-day RSVP to another type
 * must not hide "(next day)" or stretch calendar / sync ends.
 */
import {
  calendarSpan,
  rsvpEventEndDate,
  spansMultipleDays,
} from "@/lib/calendar-times";
import {
  INITIAL_FORM_STATE,
  eventEndDateForSave,
  isMultiDayRsvp,
  type CreateFormState,
} from "@/lib/create-form-state";
import { googleDateTimesForSession } from "@/lib/google-calendar-sync-format";
import { formatSessionSlotLabel } from "@/lib/slot-label";
import { signupGoogleCalendarUrl, signupIcs } from "@/lib/signup-success-calendar";
import type { SignupSuccessInfo } from "@/lib/signup-success-handoff";
import { NEXT_DAY_SUFFIX } from "@/lib/utils";

function st(patch: Partial<CreateFormState>): CreateFormState {
  return { ...INITIAL_FORM_STATE, ...patch };
}

const multiDayRsvp = st({
  eventType: "rsvp",
  multiDay: true,
  date: "2026-11-20",
  endDate: "2026-11-22",
});

describe("eventEndDateForSave / isMultiDayRsvp", () => {
  it("saves the end date for a multi-day RSVP", () => {
    expect(isMultiDayRsvp(multiDayRsvp)).toBe(true);
    expect(eventEndDateForSave(multiDayRsvp)).toBe("2026-11-22");
  });

  it("does not save an end date after switching to Scheduled Sessions", () => {
    const spots = st({ ...multiDayRsvp, eventType: "spots" });
    expect(isMultiDayRsvp(spots)).toBe(false);
    expect(eventEndDateForSave(spots)).toBeNull();
  });

  it("does not save an end date after switching to items", () => {
    const items = st({ ...multiDayRsvp, eventType: "items" });
    expect(isMultiDayRsvp(items)).toBe(false);
    expect(eventEndDateForSave(items)).toBeNull();
  });

  it("does not save when RSVP is single-day", () => {
    expect(eventEndDateForSave(st({ eventType: "rsvp", multiDay: false, date: "2026-11-20", endDate: "2026-11-22" }))).toBeNull();
    expect(eventEndDateForSave(st({ eventType: "rsvp", multiDay: true, date: "2026-11-20", endDate: "2026-11-20" }))).toBeNull();
  });
});

describe("rsvpEventEndDate (read-time, no data writes)", () => {
  it("keeps a multi-day RSVP end date and ignores leftovers on other types", () => {
    expect(rsvpEventEndDate("rsvp", "2026-11-22")).toBe("2026-11-22");
    expect(rsvpEventEndDate("spots", "2026-11-22")).toBeNull();
    expect(rsvpEventEndDate("items", "2026-11-22")).toBeNull();
  });

  it("keeps the date when the type is unknown, so older callers still work", () => {
    expect(rsvpEventEndDate(undefined, "2026-11-22")).toBe("2026-11-22");
    expect(rsvpEventEndDate(null, "2026-11-22")).toBe("2026-11-22");
  });
});

describe("overnight display and calendar with a stray end date", () => {
  it("still treats an overnight spots slot as next day", () => {
    expect(spansMultipleDays("2026-11-20", "2026-11-22", "spots")).toBe(false);
    expect(spansMultipleDays("2026-11-20", "2026-11-22", "rsvp")).toBe(true);
    expect(formatSessionSlotLabel(
      { day_of_week: 5, time: "22:00", end_time: "01:00", session_date: "2026-11-20" },
      { eventTimezone: "America/Phoenix", eventEndDate: "2026-11-22", eventType: "spots" },
    )).toContain(NEXT_DAY_SUFFIX);
  });

  it("does not stretch calendar or sync ends for a non-RSVP leftover date", () => {
    const overnight = { date: "2026-11-20", start: "22:00", end: "01:00", eventEndDate: "2026-11-22" };
    expect(calendarSpan({ ...overnight, eventType: "spots" })).toEqual({
      startDate: "2026-11-20",
      startTime: "22:00",
      endDate: "2026-11-21",
      endTime: "01:00",
      repeatUntil: null,
    });
    expect(calendarSpan({ ...overnight, eventType: "rsvp" })?.endDate).toBe("2026-11-22");

    expect(googleDateTimesForSession(
      { session_date: "2026-11-20", time: "22:00", end_time: "01:00" },
      rsvpEventEndDate("spots", "2026-11-22"),
    ).endDateTime).toBe("2026-11-21T01:00:00");
    expect(googleDateTimesForSession(
      { session_date: "2026-11-20", time: "18:00", end_time: "09:00" },
      rsvpEventEndDate("rsvp", "2026-11-22"),
    ).endDateTime).toBe("2026-11-22T09:00:00");
  });

  it("signup-success calendar ignores a stray end date on scheduled sessions", () => {
    const info: SignupSuccessInfo = {
      member_name: "Jane",
      guest_names: [],
      campaign_name: "Youth dance",
      slot_label: "Fri, Nov 20, 2026",
      event_url: "https://x.test/e",
      session_date: "2026-11-20",
      session_time: "22:00",
      session_end_time: "01:00",
      event_timezone: "America/Phoenix",
      event_end_date: "2026-11-22",
      event_type: "spots",
    };
    expect(new URL(signupGoogleCalendarUrl(info)).searchParams.get("dates")).toBe("20261120T220000/20261121T010000");
    expect(signupIcs(info)).toContain("DTEND;TZID=America/Phoenix:20261121T010000");
    expect(signupIcs(info)).not.toContain("RRULE");

    const rsvp = { ...info, event_type: "rsvp" as const };
    expect(signupIcs(rsvp)).toContain("DTEND;TZID=America/Phoenix:20261122T010000");
  });
});
