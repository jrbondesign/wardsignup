/**
 * Time and trend helpers for the founder metrics page.
 * Every week on the page is Monday to Sunday in America/Phoenix (UTC-7, no DST).
 */
import { phoenixWeekStartUtc } from "@/lib/email-capture-rate";

export { phoenixWeekStartUtc };

const PHOENIX_OFFSET_MS = -7 * 60 * 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;
export const MS_WEEK = 7 * MS_DAY;

/** Phoenix Monday (YYYY-MM-DD) of the week containing the instant `at`. */
export function phoenixWeekKey(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const start = phoenixWeekStartUtc(d);
  return new Date(start.getTime() + PHOENIX_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of Phoenix midnight starting the week keyed `weekKey` (a Phoenix Monday). */
export function phoenixWeekKeyToUtc(weekKey: string): Date {
  return new Date(`${weekKey}T07:00:00.000Z`);
}

/** Add whole weeks to a Phoenix week key. */
export function addWeeks(weekKey: string, n: number): string {
  const d = new Date(`${weekKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

/** Phoenix week keys from the week containing `from` through the week containing `to`. */
export function phoenixWeekRange(from: string | Date, to: string | Date): string[] {
  const out: string[] = [];
  const last = phoenixWeekKey(to);
  for (let w = phoenixWeekKey(from); w <= last; w = addWeeks(w, 1)) out.push(w);
  return out;
}

/** Phoenix calendar month (YYYY-MM) of an instant. */
export function phoenixMonthKey(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Date(d.getTime() + PHOENIX_OFFSET_MS).toISOString().slice(0, 7);
}

/** Shift a YYYY-MM month key by n months. */
export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1, 12));
  return d.toISOString().slice(0, 7);
}

/**
 * "Sep 2026" for a YYYY-MM key. Formats in UTC so the label never slips a month
 * (new Date("2026-10-01") is UTC midnight, which is Sep 30 in Phoenix).
 */
export function formatMonthLabel(monthKey: string, locale?: string | string[]): string {
  return new Date(`${monthKey}-01T12:00:00Z`).toLocaleDateString(locale ?? [], {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Oct 12 to Oct 18" for a Phoenix Monday key. */
export function formatWeekRange(weekKey: string, locale?: string | string[]): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const mon = new Date(`${weekKey}T12:00:00Z`);
  const sun = new Date(`${addWeeks(weekKey, 1)}T12:00:00Z`);
  sun.setUTCDate(sun.getUTCDate() - 1);
  return `${mon.toLocaleDateString(locale ?? [], opts)} to ${sun.toLocaleDateString(locale ?? [], opts)}`;
}

/** "Oct 12" for a Phoenix Monday key. */
export function formatWeekStart(weekKey: string, locale?: string | string[]): string {
  return new Date(`${weekKey}T12:00:00Z`).toLocaleDateString(locale ?? [], {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export type Trend = "up" | "down" | "flat";

/** Flat band: a change within this many percent (relative) shows ▬. */
export const TREND_FLAT_PCT = 3;

/**
 * Week over week trend. ▬ when the relative change is within ±3% (inclusive),
 * including rates (70.3% vs 69.8% is flat). From zero to more than zero is up;
 * zero to zero, or a missing value, is flat.
 */
export function trendDirection(
  current: number | null | undefined,
  previous: number | null | undefined,
  flatPct = TREND_FLAT_PCT,
): Trend {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return "flat";
  }
  if (previous === 0) return current > 0 ? "up" : current < 0 ? "down" : "flat";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  // Round to avoid float noise right at the edge (e.g. 103 vs 100).
  const rounded = Math.round(change * 1e6) / 1e6;
  if (Math.abs(rounded) <= flatPct) return "flat";
  return rounded > 0 ? "up" : "down";
}

export const TREND_ARROW: Record<Trend, string> = { up: "▲", down: "▼", flat: "▬" };

/** Relative change in percent, or null when there is no base. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
