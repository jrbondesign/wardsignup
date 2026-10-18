import { addOneHour } from './ics';

/** HH:mm or HH:mm:ss → HH:mm:ss for Google Calendar dateTime. */
export function toWallTime(time: string): string {
  const parts = time.trim().split(':');
  const h = String(Number(parts[0] || 0)).padStart(2, '0');
  const m = String(Number(parts[1] || 0)).padStart(2, '0');
  const s = String(Number(parts[2] || 0)).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Build local dateTimes from session_date + time. Sessions have no start_time column. */
export function googleDateTimesForSession(session: {
  session_date: string;
  time: string;
  end_time: string | null;
}): { startDateTime: string; endDateTime: string } {
  const startTime = toWallTime(session.time);
  const endTime = toWallTime(session.end_time || addOneHour(session.time));
  return {
    startDateTime: `${session.session_date}T${startTime}`,
    endDateTime: `${session.session_date}T${endTime}`,
  };
}

export function userFacingCalendarSyncError(error: string): string {
  const raw = error || '';
  if (raw.includes('invalid_grant') || raw.toLowerCase().includes('revoked')) {
    return 'Your Google Calendar connection expired. Reconnect it in organization settings.';
  }
  if (raw.includes('does not exist') || raw.includes('Failed to load sessions')) {
    return 'Could not load this event\'s time slots. Please try again.';
  }
  if (raw === 'No sync config found' || raw === 'Sync disabled') {
    return 'Turn on calendar sync and choose a calendar first.';
  }
  if (/column|relation|postgres|sqlstate/i.test(raw)) {
    return 'Could not sync this event to Google Calendar. Please try again.';
  }
  return raw;
}
