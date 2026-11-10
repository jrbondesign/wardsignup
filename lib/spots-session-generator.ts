/**
 * Pure helpers that turn the unified create-form state into the array of
 * session rows we POST to /api/sessions.
 *
 * Handles both date modes (range, specific) and the auto-split toggle uniformly
 * so every spots flow — preset or scratch — runs through the same generator.
 */

import type { CreateFormState } from "@/lib/create-form-state";
import { addDaysIso } from "@/lib/calendar-times";

export interface GeneratedSession {
  day_of_week: number;
  time: string; // HH:MM
  end_time: string | null;
  capacity: number;
  location: string | null;
  notes: string | null;
  session_date: string; // YYYY-MM-DD
  /** Set only in class-slot mode (one named slot per date). */
  label?: string | null;
  section?: string | null;
}

/** Sentinel capacity for "unlimited" slots, matching the rsvp/spots convention. */
const UNLIMITED = 999;

interface DayWindow {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM (may be empty when no end was set)
}

/**
 * Build the canonical list of (date, start, end) triples that the form's
 * schedule encodes. Range mode walks the date range and filters by weekday +
 * blocked dates. Specific mode just maps the picked-date rows.
 */
export function buildDayWindows(state: CreateFormState): DayWindow[] {
  if (state.spotsDateMode === "specific") {
    return state.spotsPickedDates.map((p) => ({
      date: p.date,
      start: p.start,
      end: p.end,
    }));
  }

  if (!state.spotsRangeStart || !state.spotsRangeEnd || !state.spotsStartTime) return [];

  const startD = parseIso(state.spotsRangeStart);
  const endD = parseIso(state.spotsRangeEnd);
  const blocked = new Set(state.spotsBlockedDates);
  // Empty weekdays = no filter (every day in range).
  const filter = state.spotsWeekdays.length > 0 ? new Set(state.spotsWeekdays) : null;

  const out: DayWindow[] = [];
  const cur = new Date(startD);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endD);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const ds = isoFromDate(cur);
    const include = (!filter || filter.has(cur.getDay())) && !blocked.has(ds);
    if (include) {
      out.push({ date: ds, start: state.spotsStartTime, end: state.spotsEndTime });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Top-level generator. For each day window, either emit one session (covering
 * the whole window) or split it into fixed-length slots when auto-split is on.
 */
export function generateSpotsSessions(state: CreateFormState): GeneratedSession[] {
  const windows = buildDayWindows(state);
  const location = null; // per-session location lives in phase 6 of the edit-page work; v1 leaves null

  // Class-slot mode: each picked date holds the same set of named, sectioned
  // slots (e.g. classes), each with its own capacity. One session per (date × slot).
  if (state.spotsSlots.length > 0) {
    const slots = state.spotsSlots.filter((s) => s.label.trim());
    const out: GeneratedSession[] = [];
    for (const w of windows) {
      if (!w.start) continue;
      const dow = parseIso(w.date).getDay();
      for (const slot of slots) {
        out.push({
          day_of_week: dow,
          time: w.start,
          end_time: w.end || null,
          capacity: slot.capacity == null ? UNLIMITED : Math.max(1, slot.capacity),
          location,
          notes: null,
          session_date: w.date,
          label: slot.label.trim(),
          section: (slot.section ?? "").trim() || null,
        });
      }
    }
    return out;
  }

  const capacity = Math.max(1, state.spotsCapacity || 1);
  const sessions: GeneratedSession[] = [];

  for (const w of windows) {
    if (!w.start) continue;
    const dow = parseIso(w.date).getDay();

    if (state.spotsAutoSplit && w.start && w.end && state.spotsSlotDuration > 0) {
      const startMin = toMinutes(w.start);
      let endMin = toMinutes(w.end);
      // End earlier than Start runs past midnight into the next day. Equal
      // Start and End is not a window (create blocks it), so it yields nothing.
      if (endMin < startMin) endMin += 1440;
      const dur = state.spotsSlotDuration;
      const nextDate = addDaysIso(w.date, 1);
      const nextDow = parseIso(nextDate).getDay();
      let slot = startMin;
      while (slot + dur <= endMin) {
        // Slots that start after midnight belong to the next date.
        const afterMidnight = slot >= 1440;
        sessions.push({
          day_of_week: afterMidnight ? nextDow : dow,
          time: fromMinutes(slot % 1440),
          end_time: fromMinutes((slot + dur) % 1440),
          capacity,
          location,
          notes: null,
          session_date: afterMidnight ? nextDate : w.date,
        });
        slot += dur;
      }
    } else {
      sessions.push({
        day_of_week: dow,
        time: w.start,
        end_time: w.end || null,
        capacity,
        location,
        notes: null,
        session_date: w.date,
      });
    }
  }

  return sessions;
}

// ── helpers ────────────────────────────────────────────────────────────────

function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
