/**
 * Verifies the edit page's session grouping is one-to-one with the public
 * preview: sessions group by date → section (first appearance) → class label
 * (natural sort), and each grouped item keeps its original flat-array index so
 * the edit/remove controls stay wired to the right session.
 *
 * Uses the shape of a real non-uniform event (different class sets per date) to
 * guard against the earlier "uniform classes on every date" model.
 */

import {
  groupSessionsForDisplay,
  sessionHasClasses,
  type EditSession,
} from "@/lib/edit-session-classes";

const UNLIMITED = 999;

// Sweetwater Branch shape: Jul 2 = Men's Class 1 & 2 (Men's Side only);
// Jul 9 = Women's Class (Women's Side) + Men's Class 1, 2, 3 (Men's Side).
// Deliberately provided out of order to prove grouping/sorting.
function seededSessions(): EditSession[] {
  return [
    { id: "j9-w",  day_of_week: 4, time: "17:30", capacity: 2, location: "Detention Center", notes: "", session_date: "2026-07-09", label: "Women's Class", section: "Women's Side" },
    { id: "j9-m2", day_of_week: 4, time: "17:30", capacity: 2, location: "Detention Center", notes: "", session_date: "2026-07-09", label: "Men's Class 2", section: "Men's Side" },
    { id: "j2-m1", day_of_week: 4, time: "17:30", capacity: 2, location: "Detention Center", notes: "", session_date: "2026-07-02", label: "Men's Class 1", section: "Men's Side" },
    { id: "j9-m1", day_of_week: 4, time: "17:30", capacity: 2, location: "Detention Center", notes: "", session_date: "2026-07-09", label: "Men's Class 1", section: "Men's Side" },
    { id: "j2-m2", day_of_week: 4, time: "17:30", capacity: 2, location: "Detention Center", notes: "", session_date: "2026-07-02", label: "Men's Class 2", section: "Men's Side" },
    { id: "j9-m3", day_of_week: 4, time: "17:30", capacity: 2, location: "Detention Center", notes: "", session_date: "2026-07-09", label: "Men's Class 3", section: "Men's Side" },
  ];
}

describe("groupSessionsForDisplay — edit/preview parity", () => {
  it("detects class events", () => {
    expect(sessionHasClasses(seededSessions())).toBe(true);
    expect(sessionHasClasses([{ day_of_week: 0, time: "17:00", capacity: 2, location: "", notes: "" }])).toBe(false);
  });

  it("groups by date ascending", () => {
    const groups = groupSessionsForDisplay(seededSessions());
    expect(groups.map((g) => g.sessionDate)).toEqual(["2026-07-02", "2026-07-09"]);
  });

  it("keeps each date's own class set (does NOT force uniform classes)", () => {
    const [jul2, jul9] = groupSessionsForDisplay(seededSessions());
    expect(jul2.items.map((i) => i.session.label)).toEqual(["Men's Class 1", "Men's Class 2"]);
    // Women's Side first (first appearance across the date), then Men's Side natural-sorted.
    expect(jul9.items.map((i) => i.session.label)).toEqual([
      "Women's Class",
      "Men's Class 1",
      "Men's Class 2",
      "Men's Class 3",
    ]);
  });

  it("orders by section (first appearance) then label, and natural-sorts (Class 2 before Class 10)", () => {
    const sessions: EditSession[] = [
      { id: "c10", day_of_week: 4, time: "17:30", capacity: 2, location: "", notes: "", session_date: "2026-07-09", label: "Men's Class 10", section: "Men's Side" },
      { id: "c2", day_of_week: 4, time: "17:30", capacity: 2, location: "", notes: "", session_date: "2026-07-09", label: "Men's Class 2", section: "Men's Side" },
    ];
    const [group] = groupSessionsForDisplay(sessions);
    expect(group.items.map((i) => i.session.label)).toEqual(["Men's Class 2", "Men's Class 10"]);
  });

  it("preserves each session's original flat-array index (so edit/remove target the right row)", () => {
    const sessions = seededSessions();
    const groups = groupSessionsForDisplay(sessions);
    for (const g of groups) {
      for (const item of g.items) {
        // The index must point back at the exact same session object.
        expect(sessions[item.index]).toBe(item.session);
      }
    }
  });

  it("honors explicit sort_order over label/first-appearance", () => {
    // Same date; sort_order puts Women's Side first and Men's classes in 2,1,3
    // order — overriding both label natural-sort and input first-appearance.
    const sessions: EditSession[] = [
      { id: "m1", day_of_week: 4, time: "17:30", capacity: 2, location: "", notes: "", session_date: "2026-07-09", label: "Men's Class 1", section: "Men's Side", sort_order: 2 },
      { id: "m2", day_of_week: 4, time: "17:30", capacity: 2, location: "", notes: "", session_date: "2026-07-09", label: "Men's Class 2", section: "Men's Side", sort_order: 1 },
      { id: "w",  day_of_week: 4, time: "17:30", capacity: 2, location: "", notes: "", session_date: "2026-07-09", label: "Women's Class", section: "Women's Side", sort_order: 0 },
      { id: "m3", day_of_week: 4, time: "17:30", capacity: 2, location: "", notes: "", session_date: "2026-07-09", label: "Men's Class 3", section: "Men's Side", sort_order: 3 },
    ];
    const [group] = groupSessionsForDisplay(sessions);
    expect(group.items.map((i) => i.session.label)).toEqual([
      "Women's Class",
      "Men's Class 2",
      "Men's Class 1",
      "Men's Class 3",
    ]);
  });

  it("groups plain time-only sessions by date too (no section headers)", () => {
    const sessions: EditSession[] = [
      { id: "p2", day_of_week: 4, time: "19:00", capacity: 3, location: "", notes: "", session_date: "2026-07-16" },
      { id: "p1", day_of_week: 4, time: "19:00", capacity: 3, location: "", notes: "", session_date: "2026-07-09" },
    ];
    const groups = groupSessionsForDisplay(sessions);
    expect(groups.map((g) => g.sessionDate)).toEqual(["2026-07-09", "2026-07-16"]);
    expect(groups.every((g) => g.items.every((i) => !(i.session.section ?? "").trim()))).toBe(true);
  });
});
