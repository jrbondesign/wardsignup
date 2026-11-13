/** Calendar-day helpers for the shared DateRangePicker. */

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Next start/end after a tap in range mode.
 * A complete range is never wiped: a tap before start moves start, a tap
 * after end moves end, and a tap inside the range moves the nearer bound
 * (ties go to start).
 */
export function nextDateRange(
  start: Date | null,
  end: Date | null,
  date: Date,
): { start: Date | null; end: Date | null } {
  if (!start || !end) {
    if (!start) return { start: date, end: null };
    if (dayTime(date) < dayTime(start)) return { start: date, end: null };
    if (isSameDay(date, start)) return { start, end: start };
    return { start, end: date };
  }

  if (dayTime(date) <= dayTime(start)) return { start: date, end };
  if (dayTime(date) >= dayTime(end)) return { start, end: date };

  const toStart = dayTime(date) - dayTime(start);
  const toEnd = dayTime(end) - dayTime(date);
  if (toStart <= toEnd) return { start: date, end };
  return { start, end: date };
}

export function formatRangeDay(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function rangeStartFooter(start: Date): string {
  return `Start: ${formatRangeDay(start)}. Now tap the end date.`;
}

export function rangeCompleteFooter(start: Date, end: Date): string {
  if (isSameDay(start, end)) return formatRangeDay(start);
  return `${formatRangeDay(start)} to ${formatRangeDay(end)}`;
}

export const DATE_RANGE_EMPTY_FOOTER = "Tap a start date";
export const DATE_RANGE_MISSING_ERROR = "Pick a start and end date first.";
export const CREATE_DATE_RANGE_CALENDAR_ID = "create-date-range-calendar";
