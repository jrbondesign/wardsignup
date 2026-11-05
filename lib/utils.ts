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

/**
 * Fixed en-US 12-hour clock for approximate-toggle conversion.
 * Always produces parseLooseTime-friendly "h:mm AM/PM" (not browser locale).
 */
export function formatTimeEnUs(time: string): string {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return time;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Locale-aware range like "1:00 PM to 2:00 PM" or "13:00 to 14:00" per device. */
export function formatTimeRange(start: string, end?: string | null): string {
  const a = formatTime(start);
  const endTrim = end?.trim() ?? "";
  if (!endTrim) return a;
  return `${a} to ${formatTime(endTrim)}`;
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
  // Collapse spaces including NBSP / narrow NBSP (common in en-CA locale output).
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, "");
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

  // 12-hour with am/pm (incl. a.m./p.m.), optional minutes: "4pm", "4:30pm", "6:00p.m.", "9.30am"
  const meridiem = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(a\.?m\.?|p\.?m\.?|am|pm|a|p)$/);
  if (meridiem) {
    let h = parseInt(meridiem[1], 10);
    const m = meridiem[2] ? parseInt(meridiem[2], 10) : 0;
    const isPm = meridiem[3].replace(/\./g, "").startsWith("p");
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

/** Remembered exact HH:MM and approximate free-text across Approximate toggles. */
export type ApproximateTimeMemory = {
  exactStart: string;
  exactEnd: string;
  approxStart: string;
  approxEnd: string;
  /** Text shown when switching to approximate, to tell later edits apart. */
  shownStart: string;
  shownEnd: string;
};

export const EMPTY_APPROXIMATE_TIME_MEMORY: ApproximateTimeMemory = {
  exactStart: "",
  exactEnd: "",
  approxStart: "",
  approxEnd: "",
  shownStart: "",
  shownEnd: "",
};

export const APPROXIMATE_PARSE_NOTE =
  "Could not turn that into a time. Your text was kept and comes back if you switch to plain text again.";

/**
 * Switch between exact TimeInput values and approximate free text without silent data loss.
 * Remembers the last value for each mode and restores it when available.
 */
export function switchApproximateMode(args: {
  toApproximate: boolean;
  startTime: string;
  endTime: string;
  memory: ApproximateTimeMemory;
}): {
  startTime: string;
  endTime: string;
  memory: ApproximateTimeMemory;
  note: string;
} {
  const { toApproximate, startTime, endTime, memory } = args;
  if (toApproximate) {
    const hasApprox = !!(memory.approxStart.trim() || memory.approxEnd.trim());
    // Restore the remembered text only while the picked time is unchanged since the
    // last switch; a newly picked time shows formatted (e.g. "9:00 PM").
    const pick = (exact: string, rememberedExact: string, approx: string) =>
      hasApprox && exact === rememberedExact ? approx : exact ? formatTimeEnUs(exact) : "";
    const nextStart = pick(startTime, memory.exactStart, memory.approxStart);
    const nextEnd = pick(endTime, memory.exactEnd, memory.approxEnd);
    return {
      startTime: nextStart,
      endTime: nextEnd,
      memory: {
        ...memory,
        exactStart: startTime,
        exactEnd: endTime,
        shownStart: nextStart,
        shownEnd: nextEnd,
      },
      note: "",
    };
  }

  const nextMemory: ApproximateTimeMemory = {
    ...memory,
    approxStart: startTime,
    approxEnd: endTime,
  };

  // Per field: an untouched text restores the remembered exact value (keeps HH:MM:SS).
  // A newer edit wins when it parses; if it does not, keep the remembered exact value.
  const resolve = (text: string, shown: string, exact: string): { value: string; failed: boolean } => {
    const trimmed = text.trim();
    const edited = text !== shown;
    if (!edited && exact.trim()) return { value: exact, failed: false };
    if (!trimmed) return { value: edited ? "" : exact, failed: false };
    const parsed = parseLooseTime(trimmed);
    if (parsed !== null) return { value: parsed, failed: false };
    return { value: exact, failed: true };
  };
  const start = resolve(startTime, memory.shownStart, memory.exactStart);
  const end = resolve(endTime, memory.shownEnd, memory.exactEnd);
  return {
    startTime: start.value,
    endTime: end.value,
    // Record the exact values this switch produced so a later pick can be detected.
    memory: { ...nextMemory, exactStart: start.value, exactEnd: end.value },
    note: start.failed || end.failed ? APPROXIMATE_PARSE_NOTE : "",
  };
}

/**
 * Message for add/bulk/reschedule start-time checks.
 * Partial is checked before empty so hour-only gets the finish message.
 */
export function startTimePanelError(time: string, hasPartial: boolean): string | null {
  if (hasPartial) return "Finish choosing hour, minute, and AM or PM.";
  if (!time.trim()) return "Pick a start time for this slot.";
  return null;
}

/** Items page time errors, shown next to the time fields instead of the page banner. */
export const ITEMS_TIME_ORDER_ERROR = "End time must be after start time.";
/** Same message on create, so create and edit read alike. */
export const TIME_ORDER_ERROR = ITEMS_TIME_ORDER_ERROR;

/**
 * True when both exact times are set ("HH:MM" or "HH:MM:SS") and End is not after
 * Start on the same day. Empty or non exact values are never flagged.
 */
export function isEndNotAfterStart(start: string, end: string): boolean {
  const re = /^\d{2}:\d{2}(:\d{2})?$/;
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (!re.test(s) || !re.test(e)) return false;
  return e.slice(0, 5) <= s.slice(0, 5);
}
export const ITEMS_TIME_PARTIAL_ERROR = "Finish choosing hour, minute, and AM or PM.";
export function isItemsTimeError(message: string): boolean {
  return message === ITEMS_TIME_ORDER_ERROR || message === ITEMS_TIME_PARTIAL_ERROR;
}

/**
 * Scroll a time row into view and focus its first unfinished select
 * (or the select at fallbackIndex when every part is filled).
 */
export function focusTimeRow(rowId: string, fallbackIndex = 0): void {
  if (typeof document === "undefined") return;
  const row = document.getElementById(rowId);
  if (!row) return;
  row.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const selects = Array.from(row.querySelectorAll("select"));
  const target = selects.find((el) => el.value === "" && (el.parentElement?.getAttribute("data-time-partial") === "true")) ?? selects[fallbackIndex] ?? selects[0];
  target?.focus({ preventScroll: true });
}

/** True when a DOM subtree has an incomplete TimeInput (native :invalid or data flag). */
export function subtreeHasInvalidTimeSelect(root: ParentNode | null | undefined): boolean {
  if (!root || typeof (root as Element).querySelector !== "function") return false;
  const el = root as Element;
  return !!(
    el.querySelector("select:invalid") ||
    el.querySelector('[data-time-partial="true"]')
  );
}
