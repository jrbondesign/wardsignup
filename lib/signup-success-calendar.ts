/**
 * Add-to-calendar links for the signup success page. An End earlier than
 * Start ends the next day; a multi-day RSVP with a same-day range repeats daily.
 * Without an exact start time (plain text like "around 9am") the event is
 * added as an all-day event on its date(s). Without a date there is nothing
 * to add, and the page hides the buttons (see hasSignupCalendar).
 */
import { addDaysIso, calendarSpan, googleTemplateDates, toCalDate } from "@/lib/calendar-times";
import type { SignupSuccessInfo } from "@/lib/signup-success-handoff";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** All-day range [start, endExclusive) when the session has a date but no exact start time. */
function allDayRange(info: SignupSuccessInfo): { start: string; endExclusive: string } | null {
  const date = info.session_date;
  if (!date || !ISO_DATE.test(date)) return null;
  if (calendarSpan({ date, start: info.session_time ?? "", end: null })) return null;
  const last = info.event_end_date && ISO_DATE.test(info.event_end_date) && info.event_end_date > date ? info.event_end_date : date;
  return { start: date, endExclusive: addDaysIso(last, 1) };
}

/** True when the page can offer working Google and Apple calendar buttons. */
export function hasSignupCalendar(info: SignupSuccessInfo): boolean {
  return signupIcs(info) !== null;
}

export function signupGoogleCalendarUrl(info: SignupSuccessInfo): string {
  if (!info.session_date) return "";
  let dates: string;
  let recur: string | null = null;
  const allDay = allDayRange(info);
  if (allDay) {
    dates = `${allDay.start.replace(/-/g, "")}/${allDay.endExclusive.replace(/-/g, "")}`;
  } else {
    const g = googleTemplateDates({
      date: info.session_date,
      start: info.session_time ?? "",
      end: info.session_end_time,
      eventEndDate: info.event_end_date,
    });
    if (!g) return "";
    dates = g.dates;
    recur = g.recur;
  }
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: info.campaign_name,
    dates,
    details: `Sign up or manage your spot: ${info.event_url}`,
  });
  if (recur) params.set("recur", recur);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function signupIcs(info: SignupSuccessInfo): string | null {
  if (!info.session_date) return null;
  const uid = `${info.session_date}-${info.session_time ?? "all-day"}@wardsignup.com`.replace(/[^a-zA-Z0-9@.-]/g, "-");
  let dtStart: string;
  let dtEnd: string;
  let rrule: string[] = [];
  const allDay = allDayRange(info);
  if (allDay) {
    dtStart = `DTSTART;VALUE=DATE:${allDay.start.replace(/-/g, "")}`;
    dtEnd = `DTEND;VALUE=DATE:${allDay.endExclusive.replace(/-/g, "")}`;
  } else {
    const span = calendarSpan({
      date: info.session_date,
      start: info.session_time ?? "",
      end: info.session_end_time,
      eventEndDate: info.event_end_date,
    });
    if (!span) return null;
    const tz = info.event_timezone;
    const start = toCalDate(span.startDate, span.startTime);
    const end = toCalDate(span.endDate, span.endTime);
    dtStart = tz ? `DTSTART;TZID=${tz}:${start}` : `DTSTART:${start}`;
    dtEnd = tz ? `DTEND;TZID=${tz}:${end}` : `DTEND:${end}`;
    // Multi-day events: a single VEVENT with RRULE:FREQ=DAILY;UNTIL=… renders as
    // one repeating series in Apple/Google/Outlook calendars (rather than N
    // separate imports, which Apple Calendar groups awkwardly across days).
    rrule = span.repeatUntil ? [`RRULE:FREQ=DAILY;UNTIL=${span.repeatUntil.replace(/-/g, "")}T235959Z`] : [];
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ward Signup//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    dtStart,
    dtEnd,
    ...rrule,
    `SUMMARY:${info.campaign_name}`,
    `DESCRIPTION:Sign up or manage your spot: ${info.event_url}`,
    `URL:${info.event_url}`,
    `UID:${uid}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
