/**
 * Pure helpers for the editor's slot and day actions (app/edit/[id]/page.tsx).
 * Kept free of React so they can be unit tested directly.
 */
import { groupSessionsForDisplay, type EditSession, type DisplayDateGroup } from "./edit-session-classes";

/**
 * Duplicate the slot at `index`. The copy has no id (it saves as a new row with
 * no signups) and is placed right after the original: it is inserted at
 * `index + 1` in the flat array, and sort_order is renumbered from the display
 * order so the copy shows directly below the original even when other slots
 * already carry an explicit sort_order.
 */
export function duplicateSessionAfter<T extends EditSession>(
  sessions: T[],
  index: number,
): { sessions: T[]; copyIndex: number } | null {
  const original = sessions[index];
  if (!original) return null;

  // The copy is a new row: no id and no created_at.
  const copy = { ...original } as T & { created_at?: string };
  delete copy.id;
  delete copy.created_at;

  const displayOrder = groupSessionsForDisplay(sessions).flatMap((g) => g.items.map((i) => i.index));
  const shift = (i: number) => (i > index ? i + 1 : i);
  const newOrder: number[] = [];
  for (const i of displayOrder) {
    newOrder.push(shift(i));
    if (i === index) newOrder.push(index + 1);
  }

  const next = [...sessions.slice(0, index + 1), copy as T, ...sessions.slice(index + 1)].map(
    (s) => ({ ...s }),
  );
  newOrder.forEach((flatIdx, pos) => {
    if (next[flatIdx]) next[flatIdx].sort_order = pos;
  });

  return { sessions: next, copyIndex: index + 1 };
}

/** Apply pending raw capacity input drafts (keyed by flat index) to sessions,
 *  using the same rules as the editor's commit on blur (empty or < 1 becomes 1). */
export function applyCapacityDrafts<T extends EditSession>(
  sessions: T[],
  drafts: Record<number, string>,
): T[] {
  const keys = Object.keys(drafts);
  if (keys.length === 0) return sessions;
  const next = [...sessions];
  for (const k of keys) {
    const idx = Number(k);
    const raw = drafts[idx];
    if (raw === undefined || !next[idx]) continue;
    const n = parseInt(raw, 10);
    const final = raw === "" || !Number.isFinite(n) || n < 1 ? 1 : n;
    next[idx] = { ...next[idx], capacity: final };
  }
  return next;
}

export interface GroupLocations {
  /** Location shared by every slot on the day (shown once under the date). */
  day: string | null;
  /** Location shared by every slot in a named section, when the day has no
   *  shared location (shown once under the section label). */
  bySection: Record<string, string>;
}

const loc = (s: EditSession) => (s.location ?? "").trim();

/** Work out where a day's locations should be shown so they are not repeated
 *  on every card. */
export function sharedLocations(group: Pick<DisplayDateGroup, "items">): GroupLocations {
  const all = group.items.map((i) => loc(i.session));
  const day = all.length > 0 && all[0] !== "" && all.every((l) => l === all[0]) ? all[0] : null;
  const bySection: Record<string, string> = {};
  if (day === null) {
    const sections = new Map<string, string[]>();
    for (const { session } of group.items) {
      const key = (session.section ?? "").trim();
      if (key === "") continue;
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push(loc(session));
    }
    for (const [key, locs] of sections) {
      if (locs[0] !== "" && locs.every((l) => l === locs[0])) bySection[key] = locs[0];
    }
  }
  return { day, bySection };
}

/** The location to print on one slot card, or null when its group already shows it. */
export function cardLocation(session: EditSession, shared: GroupLocations): string | null {
  const own = loc(session);
  if (own === "") return null;
  const groupLoc = shared.day ?? shared.bySection[(session.section ?? "").trim()] ?? null;
  return own === groupLoc ? null : own;
}

/** ConfirmDialog body for removing a slot that has signups. */
export function removeSlotConfirmBody(signups: number): string {
  return signups === 1
    ? "1 person is signed up for this slot. Removing it removes their signup when you save."
    : `${signups} people are signed up for this slot. Removing it removes their signups when you save.`;
}

/** ConfirmDialog body for removing a whole day. */
export function removeDayConfirmBody(slots: number, signups: number): string {
  const slotText = `${slots} ${slots === 1 ? "slot" : "slots"}`;
  return signups > 0
    ? `This removes ${slotText} and ${signups} ${signups === 1 ? "signup" : "signups"} on this day. Changes apply when you save.`
    : `This removes ${slotText}. No one has signed up yet. Changes apply when you save.`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The day heading text: "Thursday, Oct 22, 2026" (or "Thu, Oct 22, 2026"
 *  with weekday "short") for a dated day, the weekday name for a recurring one. */
export function formatDayHeading(
  group: { sessionDate: string | null; dayOfWeek: number },
  weekday: "long" | "short" = "long",
): string {
  if (!group.sessionDate) return WEEKDAYS[group.dayOfWeek] ?? "";
  const [year, month, day] = group.sessionDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Accessible name for a day's three dots button, using the heading date. */
export function dayMenuLabel(group: { sessionDate: string | null; dayOfWeek: number }): string {
  return `Options for ${formatDayHeading(group)}`;
}
