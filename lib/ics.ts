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

/** "2026-04-18" + "17:00" → "20260418T170000" */
export function toCalDate(date: string, time: string): string {
  return date.replace(/-/g, "") + "T" + time.replace(":", "") + "00";
}

/** "17:00" → "18:00" */
export function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const start = toCalDate(session.session_date, session.time);
  const endTime = session.end_time ?? addOneHour(session.time);
  const end = toCalDate(session.session_date, endTime);
  const dtStart = timezone ? `DTSTART;TZID=${timezone}:${start}` : `DTSTART:${start}`;
  const dtEnd = timezone ? `DTEND;TZID=${timezone}:${end}` : `DTEND:${end}`;
  const uid = `${campaignId ?? "event"}-${session.session_date}-${session.time}-${endTime}@wardsignup.com`.replace(/[^a-zA-Z0-9@.-]/g, "-");

  // RSVP multi-day campaigns: one VEVENT with daily recurrence.
  const rrule =
    campaignEventEndDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(campaignEventEndDate) &&
    campaignEventEndDate > session.session_date
      ? [`RRULE:FREQ=DAILY;UNTIL=${campaignEventEndDate.replace(/-/g, "")}T235959Z`]
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
