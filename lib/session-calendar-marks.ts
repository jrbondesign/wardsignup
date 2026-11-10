/**
 * Which days of a month view get a session mark (and an "open spot" dot).
 * Past days in the current month aren't marked, except an overnight slot that
 * started yesterday and is still running today: it stays listed, so its own
 * date stays marked and tappable too.
 */
import { sessionLastDate } from "@/lib/calendar-times";

type MarkSession = {
  session_date: string | null;
  day_of_week: number;
  time: string;
  end_time: string | null;
  capacity: number;
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sessionCalendarMarks<S extends MarkSession>(
  sessions: S[],
  year: number,
  month: number,
  today: Date,
  headcount: (s: S) => number,
): { sessionDays: Set<number>; availableDays: Set<number> } {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();
  const todayIso = isoDate(today);
  const isPastDay = (d: number) => isCurrentMonth && d < todayDate;

  const sessionDays = new Set<number>();
  const availableDays = new Set<number>();
  for (const session of sessions) {
    const hasSpot = headcount(session) < session.capacity;
    if (session.session_date) {
      const [sy, sm, sd] = session.session_date.split("-").map(Number);
      if (sy !== year || sm - 1 !== month) continue;
      const ended = isCurrentMonth && sessionLastDate(session.session_date, session.time, session.end_time) < todayIso;
      if (!ended) {
        sessionDays.add(sd);
        if (hasSpot) availableDays.add(sd);
      }
    } else {
      for (let d = 1; d <= daysInMonth; d++) {
        if (isPastDay(d)) continue;
        if (new Date(year, month, d).getDay() === session.day_of_week) {
          sessionDays.add(d);
          if (hasSpot) availableDays.add(d);
        }
      }
    }
  }
  return { sessionDays, availableDays };
}
