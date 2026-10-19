/**
 * WardSignup's business calendar: America/Phoenix (Arizona). Arizona has no
 * DST, so it is UTC-7 all year and plain offset math is exact.
 *
 * - A day is 00:00:00.000 through 23:59:59.999 Phoenix (07:00Z to 06:59:59.999Z).
 * - A week is Monday 00:00 through Sunday 23:59:59.999 Phoenix.
 * - Keys are Phoenix calendar dates as "YYYY-MM-DD" (a week key is its Monday).
 *
 * Vercel cron schedules are UTC by nature; convert with phoenixTimeLabel when
 * documenting them. Resend's daily email quota resets at 00:00 UTC (5pm
 * Phoenix); that boundary is deliberately NOT Phoenix and lives in
 * lib/email-queue-time.ts and lib/email-deliver.ts.
 */

export const PHOENIX_TZ = "America/Phoenix";
/** Phoenix is UTC-7 year round. */
export const PHOENIX_OFFSET_MS = -7 * 60 * 60 * 1000;
export const MS_DAY = 24 * 60 * 60 * 1000;
export const MS_WEEK = 7 * MS_DAY;

type Instant = Date | string | number;

function toDate(at: Instant): Date {
  return at instanceof Date ? at : new Date(at);
}

/** Wall clock in Phoenix, expressed as a Date whose UTC fields read Phoenix time. */
function phoenixWall(at: Instant): Date {
  return new Date(toDate(at).getTime() + PHOENIX_OFFSET_MS);
}

/** Phoenix calendar date "YYYY-MM-DD" of an instant. */
export function phoenixDateKey(at: Instant = new Date()): string {
  return phoenixWall(at).toISOString().slice(0, 10);
}

/** UTC instant of Phoenix midnight for a "YYYY-MM-DD" Phoenix date key. */
export function phoenixDateKeyToUtc(dateKey: string): Date {
  return new Date(`${dateKey}T07:00:00.000Z`);
}

/** UTC instant of Phoenix midnight starting the Phoenix day that contains `at`. */
export function phoenixDayStartUtc(at: Instant = new Date()): Date {
  return phoenixDateKeyToUtc(phoenixDateKey(at));
}

/** Add whole days to a "YYYY-MM-DD" key (calendar math, no zone involved). */
export function addDaysToKey(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Phoenix day of week, 0 = Sunday ... 6 = Saturday. */
export function phoenixWeekday(at: Instant = new Date()): number {
  return phoenixWall(at).getUTCDay();
}

/** Phoenix hour of day, 0 to 23. */
export function phoenixHour(at: Instant = new Date()): number {
  return phoenixWall(at).getUTCHours();
}

/** Phoenix Monday "YYYY-MM-DD" of the Monday to Sunday week containing `at`. */
export function phoenixWeekKey(at: Instant = new Date()): string {
  const dow = phoenixWeekday(at);
  const sinceMonday = (dow + 6) % 7;
  return addDaysToKey(phoenixDateKey(at), -sinceMonday);
}

/** UTC instant of Monday 00:00 Phoenix for the week containing `at`. */
export function phoenixWeekStartUtc(at: Instant = new Date()): Date {
  return phoenixDateKeyToUtc(phoenixWeekKey(at));
}

/** UTC instant of the next Monday 00:00 Phoenix (exclusive end of the week containing `at`). */
export function phoenixWeekEndUtc(at: Instant = new Date()): Date {
  return phoenixDateKeyToUtc(addDaysToKey(phoenixWeekKey(at), 7));
}

/** Add whole weeks to a Phoenix week key. */
export function addWeeksToKey(weekKey: string, n: number): string {
  return addDaysToKey(weekKey, 7 * n);
}

/** Phoenix calendar month "YYYY-MM" of an instant. */
export function phoenixMonthKey(at: Instant = new Date()): string {
  return phoenixDateKey(at).slice(0, 7);
}

/** "Oct 12" for a "YYYY-MM-DD" key (formatted in UTC so it never slips a day). */
export function formatDateKey(dateKey: string, locale?: string | string[]): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(locale ?? "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Oct 12 to Oct 18" (Monday to Sunday) for a Phoenix week key. */
export function formatPhoenixWeekRange(weekKey: string, locale?: string | string[]): string {
  return `${formatDateKey(weekKey, locale)} to ${formatDateKey(addDaysToKey(weekKey, 6), locale)}`;
}

/** "8:00 AM Phoenix" style label for a UTC hour and minute, for cron schedule comments. */
export function phoenixTimeLabel(utcHour: number, utcMinute = 0): string {
  const h = (((utcHour - 7) % 24) + 24) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(utcMinute).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} Phoenix`;
}
