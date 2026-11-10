/**
 * Wall-clock helpers for session/event time ranges.
 *
 * A same-day range whose End is earlier than its Start runs overnight: it ends
 * on the next calendar day (for example 10:00 PM to 1:00 AM). End equal to
 * Start is not a valid range. These helpers are pure (no imports) so client
 * components, API routes and emails can share them.
 */

/** "9:05", "09:05" or "09:05:00" → "09:05"; anything else → null. */
export function normalizeHHMM(time: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((time ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function timeToMinutes(time: string | null | undefined): number | null {
  const t = normalizeHHMM(time);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

export function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** True when both are exact times and End is earlier than Start (ends next day). */
export function isOvernightRange(start: string | null | undefined, end: string | null | undefined): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return s !== null && e !== null && e < s;
}

/** True when both are exact times and End equals Start (not a valid range). */
export function isEndSameAsStart(start: string | null | undefined, end: string | null | undefined): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return s !== null && e !== null && e === s;
}

/** Range length in minutes, treating End earlier than Start as next day. Null when either is missing. */
export function rangeMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  return e < s ? e + 1440 - s : e - s;
}

/** "2026-11-20" + 1 → "2026-11-21" (calendar arithmetic, no time zone). */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * event_end_date only describes a multi-day RSVP. Other types can keep a leftover
 * date after switching away from RSVP; ignore it so overnight slots still show
 * "(next day)" and calendar/sync ends stay on the slot. When the type is
 * omitted (older callers), the date is used as before.
 */
export function rsvpEventEndDate(
  eventType: string | null | undefined,
  eventEndDate: string | null | undefined,
): string | null {
  if (eventType != null && eventType !== "rsvp") return null;
  return eventEndDate ?? null;
}

/**
 * True when a dated session belongs to an event that runs past its own date
 * (a multi-day RSVP: event_end_date after session_date). Such a range spans
 * the whole event, so "(next day)" is not shown for it.
 */
export function spansMultipleDays(
  date: string | null | undefined,
  eventEndDate: string | null | undefined,
  eventType?: string | null,
): boolean {
  const end = rsvpEventEndDate(eventType, eventEndDate);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return !!date && !!end && iso.test(date) && iso.test(end) && end > date;
}

/**
 * The calendar date a dated session finishes on: the next day for an overnight
 * range, otherwise its own date. Use for "has this slot passed" checks.
 */
export function sessionLastDate(date: string, start: string | null | undefined, end: string | null | undefined): string {
  return isOvernightRange(start, end) ? addDaysIso(date, 1) : date;
}

export type CalendarSpan = {
  startDate: string;
  startTime: string; // HH:MM
  endDate: string;
  endTime: string; // HH:MM
  /** Daily repeat until this date (multi-day RSVP with a same-day range), else null. */
  repeatUntil: string | null;
};

/**
 * Start and end instants (wall clock) for calendar exports.
 * - No end: one hour after start, rolling into the next day after 11 PM.
 * - End earlier than start: ends the next day.
 * - Multi-day (eventEndDate after date): a same-day range repeats daily until
 *   eventEndDate; an overnight range is one span from the first day's start to
 *   the last day's end (e.g. a campout Fri 6 PM to Sat 9 AM).
 */
export function calendarSpan(args: {
  date: string;
  start: string;
  end: string | null | undefined;
  eventEndDate?: string | null;
  eventType?: string | null;
}): CalendarSpan | null {
  const startTime = normalizeHHMM(args.start);
  if (!startTime || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return null;
  const startMin = timeToMinutes(startTime)!;
  const endNorm = normalizeHHMM(args.end);
  const eventEndDate = rsvpEventEndDate(args.eventType, args.eventEndDate);
  const multiDay =
    !!eventEndDate && /^\d{4}-\d{2}-\d{2}$/.test(eventEndDate) && eventEndDate > args.date;

  let endTime: string;
  let overnight: boolean;
  if (endNorm) {
    endTime = endNorm;
    overnight = timeToMinutes(endNorm)! < startMin;
  } else {
    endTime = minutesToHHMM(startMin + 60);
    overnight = startMin + 60 >= 1440;
  }
  if (multiDay && overnight && endNorm) {
    return { startDate: args.date, startTime, endDate: eventEndDate!, endTime, repeatUntil: null };
  }
  const endDate = overnight ? addDaysIso(args.date, 1) : args.date;
  return { startDate: args.date, startTime, endDate, endTime, repeatUntil: multiDay ? eventEndDate! : null };
}

/** "2026-04-18" + "17:00" (or "17:00:00") → "20260418T170000" */
export function toCalDate(date: string, time: string): string {
  const t = normalizeHHMM(time) ?? time.slice(0, 5);
  return date.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
}

/**
 * Google Calendar "render?action=TEMPLATE" params for a session: the local
 * `dates` pair and an optional daily `recur` rule (multi-day, same-day range).
 */
export function googleTemplateDates(args: {
  date: string;
  start: string;
  end: string | null | undefined;
  eventEndDate?: string | null;
  eventType?: string | null;
}): { dates: string; recur: string | null } | null {
  const span = calendarSpan(args);
  if (!span) return null;
  return {
    dates: `${toCalDate(span.startDate, span.startTime)}/${toCalDate(span.endDate, span.endTime)}`,
    recur: span.repeatUntil ? `RRULE:FREQ=DAILY;UNTIL=${span.repeatUntil.replace(/-/g, "")}T235959Z` : null,
  };
}
