/**
 * Format a "HH:mm" (or "HH:mm:ss") time string for display using the runtime
 * default locale. Hour cycle (12h vs 24h) follows the device/browser locale —
 * do not pass `hour12`; that preserves system preference.
 */
export function formatTime(time: string): string {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return time;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Locale-aware range like "1:00 PM – 2:00 PM" or "13:00 – 14:00" per device. */
export function formatTimeRange(start: string, end?: string | null): string {
  const a = formatTime(start);
  const endTrim = end?.trim() ?? "";
  if (!endTrim) return a;
  return `${a} – ${formatTime(endTrim)}`;
}

/**
 * Parse a loose time string into a 24-hour "HH:MM" value. Returns null if the
 * input doesn't look like a time at all.
 *
 * Accepts (case- and whitespace-insensitive):
 *   "4pm" "4 pm" "4PM"           → "16:00"
 *   "4:30pm" "4:30 PM"           → "16:30"
 *   "9am" "9:00am"               → "09:00"
 *   "12pm" / "12am"              → "12:00" / "00:00"
 *   "9" (bare hour, no meridiem) → "09:00"
 *   "1430" "14:30" "14.30"       → "14:30"
 */
export function parseLooseTime(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // Already in HH:MM[:SS] form? Accept as-is after light normalization.
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }

  // 24-hour compact "1430" / "0900"
  const compact = s.match(/^(\d{1,2})(\d{2})$/);
  if (compact && s.length === 4) {
    const h = parseInt(compact[1], 10);
    const m = parseInt(compact[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // 12-hour with am/pm, optional minutes: "4pm", "4:30pm", "9.30am"
  const meridiem = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm|a|p)$/);
  if (meridiem) {
    let h = parseInt(meridiem[1], 10);
    const m = meridiem[2] ? parseInt(meridiem[2], 10) : 0;
    const isPm = meridiem[3].startsWith("p");
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (h === 12) h = 0;
    if (isPm) h += 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Bare hour: "9" → "09:00", "14" → "14:00"
  const bare = s.match(/^(\d{1,2})$/);
  if (bare) {
    const h = parseInt(bare[1], 10);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  return null;
}
