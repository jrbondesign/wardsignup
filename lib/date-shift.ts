/** Utilities for shifting calendar dates stored as "YYYY-MM-DD" strings.
 *
 * Dates are treated as bare calendar days (no time zone). Parsing goes through
 * Date.UTC so day arithmetic never crosses a DST boundary or drifts by the local
 * offset. YYYY-MM-DD strings also sort lexicographically in chronological order,
 * which earliestYmd() relies on. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value.trim());
}

const MS_PER_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" as a UTC timestamp. Returns null if malformed or a rollover
 *  (e.g. 2026-02-31, which JS would otherwise wrap to March). */
function parseYmdUtc(value: string): number | null {
  if (!isYmd(value)) return null;
  const [y, m, d] = value.trim().split("-").map(Number);
  const ts = Date.UTC(y, m - 1, d);
  const dt = new Date(ts);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return ts;
}

function formatYmdUtc(ts: number): string {
  const dt = new Date(ts);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole-day difference (b - a). Returns null if either date is malformed. */
export function diffDays(a: string, b: string): number | null {
  const ta = parseYmdUtc(a);
  const tb = parseYmdUtc(b);
  if (ta === null || tb === null) return null;
  return Math.round((tb - ta) / MS_PER_DAY);
}

/** Shift a "YYYY-MM-DD" date by n days. Returns the input unchanged if malformed. */
export function shiftYmd(value: string, days: number): string {
  const ts = parseYmdUtc(value);
  if (ts === null) return value;
  return formatYmdUtc(ts + days * MS_PER_DAY);
}

/** Shift a nullable date field. Valid dates shift; null/blank/malformed → null. */
export function shiftNullableYmd(value: string | null | undefined, days: number): string | null {
  if (typeof value === "string" && isYmd(value)) return shiftYmd(value, days);
  return null;
}

/** Earliest valid YYYY-MM-DD among the inputs, or null if none are valid. */
export function earliestYmd(values: Array<string | null | undefined>): string | null {
  let min: string | null = null;
  for (const v of values) {
    if (typeof v === "string" && isYmd(v)) {
      const trimmed = v.trim();
      if (min === null || trimmed < min) min = trimmed;
    }
  }
  return min;
}
