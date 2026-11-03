import { formatInTimeZone } from "date-fns-tz";
import { resolveEffectiveEventTimezone, sessionStartUtc } from "@/lib/event-timezone";
import { formatTimeRange } from "@/lib/utils";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Slot label for emails (digest, faster alerts, participant confirmation/reminders).
 * Pass `eventTimezone` for dated slots so the calendar line matches the organizer’s zone
 * (server default timezone is wrong on Vercel).
 */
export function formatSessionSlotLabel(
  sess: {
    day_of_week: number;
    time: string;
    end_time: string | null;
    session_date: string | null;
  },
  options?: { eventTimezone?: string | null },
): string {
  if (sess.session_date) {
    if (options !== undefined) {
      const tz = resolveEffectiveEventTimezone(options.eventTimezone);
      try {
        const start = sessionStartUtc(sess.session_date, sess.time, tz);
        const dateStr = formatInTimeZone(start, tz, "EEE, MMM d, yyyy");
        return `${dateStr} · ${formatTimeRange(sess.time, sess.end_time)}`;
      } catch {
        /* fall through to legacy */
      }
    }
    const [y, m, d] = sess.session_date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dateStr = dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${dateStr} · ${formatTimeRange(sess.time, sess.end_time)}`;
  }
  return `${DAYS[sess.day_of_week] ?? "Day"} · ${formatTimeRange(sess.time, sess.end_time)}`;
}
