/**
 * Shared VCALENDAR/.ics builders. Used by the participant calendar download
 * route (app/api/signups/calendar/[token]) and the leader notification email
 * (lib/leader-email.ts), which attaches the .ics to each signup alert.
 */

export type IcsSession = {
  time: string;
  end_time: string | null;
  session_date: string | null;
};

import { calendarSpan, minutesToHHMM, timeToMinutes, toCalDate } from "@/lib/calendar-times";

export { toCalDate };

/** "17:00" → "18:00" (wraps past midnight; pair with calendarSpan for the date). */
export function addOneHour(time: string): string {
  const m = timeToMinutes(time);
  return m === null ? time : minutesToHHMM(m + 60);
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Current UTC instant as an ics DATE-TIME, for the required DTSTAMP property. */
function icsUtcNow(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildVeventLines(opts: {
  session: IcsSession;
  campaignName: string;
  eventUrl: string;
  timezone: string | null;
  campaignEventEndDate: string | null;
  /** Makes UIDs unique per event — without it, same-date/time slots of different events collide and calendar clients overwrite one with the other. */
  campaignId?: string | null;
}): string[] {
  const { session, campaignName, eventUrl, timezone, campaignEventEndDate, campaignId } = opts;
  if (!session.session_date || !session.time) return [];
  // End earlier than start ends the next day; a multi-day overnight range is one span.
  const span = calendarSpan({
    date: session.session_date,
    start: session.time,
    end: session.end_time,
    eventEndDate: campaignEventEndDate,
  });
  if (!span) return [];
  const start = toCalDate(span.startDate, span.startTime);
  const end = toCalDate(span.endDate, span.endTime);
  const dtStart = timezone ? `DTSTART;TZID=${timezone}:${start}` : `DTSTART:${start}`;
  const dtEnd = timezone ? `DTEND;TZID=${timezone}:${end}` : `DTEND:${end}`;
  const endTime = session.end_time ?? addOneHour(session.time);
  const uid = `${campaignId ?? "event"}-${session.session_date}-${session.time}-${endTime}@wardsignup.com`.replace(/[^a-zA-Z0-9@.-]/g, "-");

  // RSVP multi-day campaigns with a same-day range: one VEVENT with daily recurrence.
  const rrule = span.repeatUntil
    ? [`RRULE:FREQ=DAILY;UNTIL=${span.repeatUntil.replace(/-/g, "")}T235959Z`]
    : [];

  return [
    "BEGIN:VEVENT",
    `DTSTAMP:${icsUtcNow()}`,
    dtStart,
    dtEnd,
    ...rrule,
    `SUMMARY:${escapeIcsText(campaignName)}`,
    `DESCRIPTION:${escapeIcsText(`Sign up or manage your spot: ${eventUrl}`)}`,
    `URL:${eventUrl}`,
    `UID:${uid}`,
    "END:VEVENT",
  ];
}

export function wrapVcalendar(veventLines: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ward Signup//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...veventLines,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Full .ics text for one or more dated slots of a campaign.
 * Returns null when no slot has a concrete date+time (nothing to put on a calendar).
 */
export function buildEventIcs(opts: {
  sessions: IcsSession[];
  campaignName: string;
  eventUrl: string;
  timezone: string | null;
  campaignEventEndDate: string | null;
  campaignId?: string | null;
}): string | null {
  const veventLines = opts.sessions.flatMap((session) =>
    buildVeventLines({
      session,
      campaignName: opts.campaignName,
      eventUrl: opts.eventUrl,
      timezone: opts.timezone,
      campaignEventEndDate: opts.campaignEventEndDate,
      campaignId: opts.campaignId,
    }),
  );
  if (veventLines.length === 0) return null;
  return wrapVcalendar(veventLines);
}

export function icsFilenameForCampaign(campaignName: string): string {
  return `${campaignName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.ics`;
}
