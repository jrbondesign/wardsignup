/**
 * Display grouping for the edit page's Scheduled Sessions list.
 *
 * Scheduled Sessions can carry per-date "class" slots — an optional label
 * (e.g. "Men's Class 1") and section header (e.g. "Men's Side"). The public
 * signup/preview page renders these grouped by date → section → class
 * (see app/event/[id]/page.tsx: groupedByDate + orderSessionsBySection).
 *
 * These helpers reproduce that exact grouping for the edit page so the two are
 * one-to-one, while preserving each session's original index in the flat
 * `sessions` array (edit/remove operate by index).
 */

/** Sentinel capacity meaning "unlimited", matching spots-session-generator. */
export const UNLIMITED_CAPACITY = 999;

export interface EditSession {
  id?: string;
  day_of_week: number;
  time: string;
  end_time?: string;
  capacity: number;
  location: string;
  notes: string;
  session_date?: string;
  label?: string;
  section?: string;
  /** Explicit organizer-set display order. Undefined slots sort last. */
  sort_order?: number;
}

/** Pure sort_order compare; ties return 0 so a stable sort preserves input
 *  order (i.e. section first-appearance) for slots that predate sort_order. */
const bySortOrderStable = (a: EditSession, b: EditSession) =>
  (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);

/** Within a section: explicit sort_order, then label natural-sort as a tiebreak
 *  (so Class 2 precedes Class 10 when neither has an explicit order). */
const bySortOrder = (a: EditSession, b: EditSession) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return byNatural((a.label ?? "").trim(), (b.label ?? "").trim());
};

/** True when any session carries a class label — i.e. the event uses per-date
 *  class slots rather than plain time-only slots. */
export const sessionHasClasses = (sessions: EditSession[]): boolean =>
  sessions.some((s) => (s.label ?? "").trim() !== "");

/** Natural-order compare so "Class 2" sorts before "Class 10". */
const byNatural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** A session paired with its index in the original flat `sessions` array. */
export interface IndexedSession {
  session: EditSession;
  index: number;
}

export interface DisplayDateGroup {
  /** Group key: the ISO date, or `dow-N` for a recurring weekday session. */
  key: string;
  /** ISO date (YYYY-MM-DD) or null for a recurring weekday session. */
  sessionDate: string | null;
  dayOfWeek: number;
  /** Sessions on this date, already ordered by section (first appearance) then
   *  label — section headers can be drawn when `section` changes between items. */
  items: IndexedSession[];
}

/**
 * Group the flat session list by date (ascending), and within each date order
 * by section (first appearance) then class label — mirroring the preview page.
 * Recurring weekday sessions (no `session_date`) group under a `dow-N` key.
 */
export function groupSessionsForDisplay(sessions: EditSession[]): DisplayDateGroup[] {
  const order: string[] = [];
  const groups = new Map<string, DisplayDateGroup>();

  sessions.forEach((session, index) => {
    const key = session.session_date ?? `dow-${session.day_of_week}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        sessionDate: session.session_date ?? null,
        dayOfWeek: session.day_of_week,
        items: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.items.push({ session, index });
  });

  // Within each date, order by the organizer's explicit sort_order, then group
  // by section (first appearance in that sorted order) so a section's classes
  // stay contiguous while honoring drag-reordering. Paired index stays intact.
  for (const group of groups.values()) {
    // Stable pre-sort by sort_order — ties keep input order, so section
    // first-appearance is unchanged for slots without an explicit order.
    const sorted = [...group.items].sort((a, b) => bySortOrderStable(a.session, b.session));
    const sectionOrder: string[] = [];
    const bySection = new Map<string, IndexedSession[]>();
    for (const item of sorted) {
      const sKey = (item.session.section ?? "").trim();
      if (!bySection.has(sKey)) {
        bySection.set(sKey, []);
        sectionOrder.push(sKey);
      }
      bySection.get(sKey)!.push(item);
    }
    // Within each section, order by sort_order then label.
    group.items = sectionOrder.flatMap((k) =>
      bySection.get(k)!.sort((a, b) => bySortOrder(a.session, b.session)),
    );
  }

  // Dates ascending; recurring weekday keys sort after ISO dates ('2' < 'd').
  return order.sort((a, b) => a.localeCompare(b)).map((k) => groups.get(k)!);
}
