/**
 * Same-day ranges whose End is earlier than Start run overnight (end next day).
 * Covers the shared helpers, calendar exports, display, past-slot logic and
 * the spots/tithing generators.
 */
import {
  addDaysIso,
  calendarSpan,
  googleTemplateDates,
  isEndSameAsStart,
  isOvernightRange,
  rangeMinutes,
  sessionLastDate,
  toCalDate,
} from "@/lib/calendar-times";
import { buildEventIcs, buildVeventLines } from "@/lib/ics";
import { googleDateTimesForSession } from "@/lib/google-calendar-sync-format";
import { signupGoogleCalendarUrl, signupIcs } from "@/lib/signup-success-calendar";
import { endTimeNote, formatTimeRange, NEXT_DAY_SUFFIX, nextDaySuffix, tithingWindowError } from "@/lib/utils";
import { generateSpotsSessions } from "@/lib/spots-session-generator";
import { generateTithingDeclarationSessions } from "@/lib/tithing-reschedule";
import { firstUpcomingMonth } from "@/components/event/hooks/useEventPageData";
import { INITIAL_FORM_STATE, type CreateFormState } from "@/lib/create-form-state";
import type { SessionWithSignups } from "@/components/event/event-page-shared";
import type { SignupSuccessInfo } from "@/lib/signup-success-handoff";

const line = (lines: string[], key: string) => lines.find((l) => l.startsWith(key));

describe("calendar-times helpers", () => {
  it("detects overnight and equal ranges, accepting HH:MM:SS", () => {
    expect(isOvernightRange("22:00", "01:00")).toBe(true);
    expect(isOvernightRange("22:00:00", "01:00:00")).toBe(true);
    expect(isOvernightRange("09:00", "17:00")).toBe(false);
    expect(isOvernightRange("09:00", "09:00")).toBe(false);
    expect(isOvernightRange("22:00", null)).toBe(false);
    expect(isEndSameAsStart("09:00", "09:00:00")).toBe(true);
  });

  it("measures overnight length across midnight", () => {
    expect(rangeMinutes("22:00", "01:00")).toBe(180);
    expect(rangeMinutes("09:00", "10:30")).toBe(90);
  });

  it("adds days across month and year ends", () => {
    expect(addDaysIso("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("sessionLastDate is the next day only for overnight ranges", () => {
    expect(sessionLastDate("2026-11-20", "22:00", "01:00")).toBe("2026-11-21");
    expect(sessionLastDate("2026-11-20", "09:00", "10:00")).toBe("2026-11-20");
    expect(sessionLastDate("2026-11-20", "22:00", null)).toBe("2026-11-20");
  });

  it("toCalDate handles HH:MM and HH:MM:SS", () => {
    expect(toCalDate("2026-11-20", "22:00")).toBe("20261120T220000");
    expect(toCalDate("2026-11-20", "22:00:00")).toBe("20261120T220000");
  });

  it("calendarSpan: overnight ends next date, default hour rolls past midnight", () => {
    expect(calendarSpan({ date: "2026-11-20", start: "22:00", end: "01:00" })).toEqual({
      startDate: "2026-11-20", startTime: "22:00", endDate: "2026-11-21", endTime: "01:00", repeatUntil: null,
    });
    expect(calendarSpan({ date: "2026-12-31", start: "23:30", end: null })).toMatchObject({
      endDate: "2027-01-01", endTime: "00:30",
    });
    expect(calendarSpan({ date: "2026-11-20", start: "09:00", end: "10:00" })).toMatchObject({
      endDate: "2026-11-20", endTime: "10:00",
    });
  });

  it("calendarSpan: multi-day keeps daily repeat for same-day ranges, one span for overnight", () => {
    expect(calendarSpan({ date: "2026-11-20", start: "09:00", end: "17:00", eventEndDate: "2026-11-22" })).toMatchObject({
      endDate: "2026-11-20", repeatUntil: "2026-11-22",
    });
    expect(calendarSpan({ date: "2026-11-20", start: "18:00", end: "09:00", eventEndDate: "2026-11-21" })).toEqual({
      startDate: "2026-11-20", startTime: "18:00", endDate: "2026-11-21", endTime: "09:00", repeatUntil: null,
    });
  });
});

describe("ICS export", () => {
  const base = { campaignName: "Youth dance", eventUrl: "https://x.test/e", timezone: "America/Phoenix", campaignEventEndDate: null };

  it("puts DTEND on the next date for 10 PM to 1 AM", () => {
    const lines = buildVeventLines({ ...base, session: { session_date: "2026-11-20", time: "22:00:00", end_time: "01:00:00" } });
    expect(line(lines, "DTSTART")).toBe("DTSTART;TZID=America/Phoenix:20261120T220000");
    expect(line(lines, "DTEND")).toBe("DTEND;TZID=America/Phoenix:20261121T010000");
    expect(line(lines, "RRULE")).toBeUndefined();
  });

  it("keeps same-day ranges on the same date", () => {
    const lines = buildVeventLines({ ...base, session: { session_date: "2026-11-20", time: "09:00", end_time: "10:30" } });
    expect(line(lines, "DTEND")).toBe("DTEND;TZID=America/Phoenix:20261120T103000");
  });

  it("rolls a default one-hour end past midnight to the next date", () => {
    const lines = buildVeventLines({ ...base, timezone: null, session: { session_date: "2026-11-20", time: "23:30", end_time: null } });
    expect(line(lines, "DTEND")).toBe("DTEND:20261121T003000");
  });

  it("multi-day overnight RSVP is one span with no daily repeat", () => {
    const lines = buildVeventLines({
      ...base,
      campaignEventEndDate: "2026-11-21",
      session: { session_date: "2026-11-20", time: "18:00", end_time: "09:00" },
    });
    expect(line(lines, "DTEND")).toBe("DTEND;TZID=America/Phoenix:20261121T090000");
    expect(line(lines, "RRULE")).toBeUndefined();
  });

  it("multi-day same-day RSVP still repeats daily", () => {
    const lines = buildVeventLines({
      ...base,
      campaignEventEndDate: "2026-11-22",
      session: { session_date: "2026-11-20", time: "09:00", end_time: "17:00" },
    });
    expect(line(lines, "DTEND")).toBe("DTEND;TZID=America/Phoenix:20261120T170000");
    expect(line(lines, "RRULE")).toBe("RRULE:FREQ=DAILY;UNTIL=20261122T235959Z");
  });

  it("every VEVENT in a calendar ends after it starts", () => {
    const ics = buildEventIcs({
      ...base,
      sessions: [
        { session_date: "2026-11-20", time: "22:00", end_time: "01:00" },
        { session_date: "2026-11-21", time: "23:45", end_time: "00:15" },
        { session_date: "2026-11-22", time: "09:00", end_time: "10:00" },
      ],
    })!;
    const starts = [...ics.matchAll(/DTSTART[^:]*:(\d{8}T\d{6})/g)].map((m) => m[1]);
    const ends = [...ics.matchAll(/DTEND[^:]*:(\d{8}T\d{6})/g)].map((m) => m[1]);
    expect(starts).toHaveLength(3);
    starts.forEach((s, i) => expect(ends[i] > s).toBe(true));
  });
});

describe("Google Calendar export", () => {
  it("sync: overnight end dateTime lands on the next date", () => {
    expect(googleDateTimesForSession({ session_date: "2026-11-20", time: "22:00:00", end_time: "01:00:00" })).toEqual({
      startDateTime: "2026-11-20T22:00:00",
      endDateTime: "2026-11-21T01:00:00",
    });
    expect(googleDateTimesForSession({ session_date: "2026-11-20", time: "23:30", end_time: null }).endDateTime).toBe(
      "2026-11-21T00:30:00",
    );
  });

  it("template link dates cross midnight", () => {
    expect(googleTemplateDates({ date: "2026-11-20", start: "22:00", end: "01:00" })).toEqual({
      dates: "20261120T220000/20261121T010000",
      recur: null,
    });
  });
});

describe("signup success calendar links", () => {
  const info = {
    member_name: "A",
    guest_names: [],
    campaign_name: "Youth dance",
    slot_label: "",
    event_url: "https://x.test/e",
    session_date: "2026-11-20",
    session_time: "22:00:00",
    session_end_time: "01:00:00",
    event_timezone: "America/Phoenix",
    event_end_date: null,
  } as unknown as SignupSuccessInfo;

  it("Google link and .ics end on the next date", () => {
    const url = new URL(signupGoogleCalendarUrl(info));
    expect(url.searchParams.get("dates")).toBe("20261120T220000/20261121T010000");
    const ics = signupIcs(info)!;
    expect(ics).toContain("DTEND;TZID=America/Phoenix:20261121T010000");
  });
});

describe("display", () => {
  it("formatTimeRange marks overnight ranges", () => {
    expect(formatTimeRange("22:00", "01:00")).toMatch(/ to .* \(next\u00A0day\)$/);
    expect(formatTimeRange("09:00", "10:00")).not.toMatch(/next/);
    expect(nextDaySuffix("22:00:00", "01:00:00")).toBe(NEXT_DAY_SUFFIX);
  });

  it("End time label note reads (next day) for overnight", () => {
    expect(endTimeNote("22:00", "01:00")).toBe("(next day)");
    expect(endTimeNote("09:00", "10:00")).toBe("(optional)");
  });
});

describe("spots generator", () => {
  const spots = (patch: Partial<CreateFormState>) =>
    generateSpotsSessions({ ...INITIAL_FORM_STATE, eventType: "spots", spotsCapacity: 1, ...patch } as CreateFormState);

  it("splits an overnight specific-date window across midnight", () => {
    const out = spots({
      spotsDateMode: "specific",
      spotsPickedDates: [{ id: "a", date: "2026-11-20", start: "23:00", end: "01:00" }],
      spotsAutoSplit: true,
      spotsSlotDuration: 30,
    });
    expect(out.map((s) => [s.session_date, s.time, s.end_time])).toEqual([
      ["2026-11-20", "23:00", "23:30"],
      ["2026-11-20", "23:30", "00:00"],
      ["2026-11-21", "00:00", "00:30"],
      ["2026-11-21", "00:30", "01:00"],
    ]);
    // Weekday follows the slot's own date (Nov 20 2026 is a Friday).
    expect(out.map((s) => s.day_of_week)).toEqual([5, 5, 6, 6]);
  });

  it("splits an overnight range window on each day, never negative or empty", () => {
    const out = spots({
      spotsDateMode: "range",
      spotsRangeStart: "2026-11-20",
      spotsRangeEnd: "2026-11-21",
      spotsWeekdays: [],
      spotsStartTime: "22:00",
      spotsEndTime: "01:00",
      spotsAutoSplit: true,
      spotsSlotDuration: 60,
    });
    expect(out).toHaveLength(6);
    for (const s of out) expect(rangeMinutes(s.time, s.end_time)).toBe(60);
    expect(out[2]).toMatchObject({ session_date: "2026-11-21", time: "00:00", end_time: "01:00" });
  });

  it("keeps an overnight window as one session without auto-split", () => {
    const out = spots({
      spotsDateMode: "specific",
      spotsPickedDates: [{ id: "a", date: "2026-11-20", start: "22:00", end: "01:00" }],
      spotsAutoSplit: false,
    });
    expect(out).toEqual([expect.objectContaining({ session_date: "2026-11-20", time: "22:00", end_time: "01:00" })]);
  });
});

describe("tithing reschedule (blocked overnight)", () => {
  it("flags overnight and equal windows and generates nothing for them", () => {
    expect(tithingWindowError("21:00", "01:00", 15)).toMatch(/past midnight/);
    expect(tithingWindowError("09:00", "09:00", 15)).toBe("End time can't be the same as start time.");
    expect(tithingWindowError("09:00", "12:00", 15)).toBeNull();
    const out = generateTithingDeclarationSessions({
      rangeStart: new Date(2026, 10, 20),
      rangeEnd: new Date(2026, 10, 20),
      days: [5],
      startTime: "21:00",
      endTime: "01:00",
      durationMinutes: 15,
      capacity: 1,
      location: "",
      notes: "",
    });
    expect(out).toEqual([]);
  });
});

describe("past slot logic", () => {
  const sess = (session_date: string, time: string, end_time: string | null) =>
    ({ id: session_date + time, session_date, time, end_time, day_of_week: 0, capacity: 1, signups: [] }) as unknown as SessionWithSignups;

  it("an overnight slot from yesterday still counts as upcoming today", () => {
    const now = new Date(2026, 11, 1, 0, 30); // Dec 1, 12:30 AM
    expect(firstUpcomingMonth([sess("2026-11-30", "22:00", "01:00")], now)).toEqual(new Date(2026, 10, 1));
    expect(firstUpcomingMonth([sess("2026-11-30", "09:00", "10:00")], now)).toBeNull();
  });
});
