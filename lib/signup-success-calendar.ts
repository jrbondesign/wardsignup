/**
 * Add-to-calendar links for the signup success page. An End earlier than
 * Start ends the next day; a multi-day RSVP with a same-day range repeats daily.
 */
import { calendarSpan, googleTemplateDates, toCalDate } from "@/lib/calendar-times";
import type { SignupSuccessInfo } from "@/lib/signup-success-handoff";

export function signupGoogleCalendarUrl(info: SignupSuccessInfo): string {
  if (!info.session_date || !info.session_time) return "";
  const g = googleTemplateDates({
    date: info.session_date,
    start: info.session_time,
    end: info.session_end_time,
    eventEndDate: info.event_end_date,
  });
  if (!g) return "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: info.campaign_name,
    dates: g.dates,
    details: `Sign up or manage your spot: ${info.event_url}`,
  });
  if (g.recur) params.set("recur", g.recur);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function signupIcs(info: SignupSuccessInfo): string | null {
  if (!info.session_date || !info.session_time) return null;
  const span = calendarSpan({
    date: info.session_date,
    start: info.session_time,
    end: info.session_end_time,
    eventEndDate: info.event_end_date,
  });
  if (!span) return null;
  const tz = info.event_timezone;
  const start = toCalDate(span.startDate, span.startTime);
  const end = toCalDate(span.endDate, span.endTime);
  const dtStart = tz ? `DTSTART;TZID=${tz}:${start}` : `DTSTART:${start}`;
  const dtEnd = tz ? `DTEND;TZID=${tz}:${end}` : `DTEND:${end}`;
  const uid = `${info.session_date}-${info.session_time}@wardsignup.com`.replace(/[^a-zA-Z0-9@.-]/g, "-");

  // Multi-day events: a single VEVENT with RRULE:FREQ=DAILY;UNTIL=… renders as
  // one repeating series in Apple/Google/Outlook calendars (rather than N
  // separate imports, which Apple Calendar groups awkwardly across days).
  const rrule = span.repeatUntil
    ? [`RRULE:FREQ=DAILY;UNTIL=${span.repeatUntil.replace(/-/g, "")}T235959Z`]
    : [];

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
