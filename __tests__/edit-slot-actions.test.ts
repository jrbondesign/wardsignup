/**
 * Pure helpers behind the editor's Duplicate slot, location display and
 * remove confirmations (lib/edit-slot-actions.ts).
 */
import {
  applyCapacityDrafts,
  cardLocation,
  duplicateSessionAfter,
  removeDayConfirmBody,
  removeSlotConfirmBody,
  sharedLocations,
} from "@/lib/edit-slot-actions";
import { groupSessionsForDisplay, type EditSession } from "@/lib/edit-session-classes";

const s = (over: Partial<EditSession>): EditSession => ({
  day_of_week: 4,
  time: "17:00",
  capacity: 4,
  location: "",
  notes: "",
  session_date: "2026-10-08",
  ...over,
});

const displayIds = (list: EditSession[]) =>
  groupSessionsForDisplay(list).flatMap((g) => g.items.map((i) => i.session.id ?? `copy:${i.session.time}`));

describe("duplicateSessionAfter", () => {
  it("inserts the copy right after the original, without id, and returns its index", () => {
    const list = [s({ id: "a", time: "17:00" }), s({ id: "b", time: "18:00" }), s({ id: "c", time: "19:00" })];
    const res = duplicateSessionAfter(list, 1)!;
    expect(res.copyIndex).toBe(2);
    expect(res.sessions).toHaveLength(4);
    expect(res.sessions[2].id).toBeUndefined();
    expect(res.sessions[2].time).toBe("18:00");
    expect(displayIds(res.sessions)).toEqual(["a", "b", "copy:18:00", "c"]);
  });

  it("shows the copy right below the original even when slots have explicit sort_order", () => {
    // Flat order differs from display order; sort_order wins.
    const list = [
      s({ id: "c", time: "19:00", sort_order: 2 }),
      s({ id: "a", time: "17:00", sort_order: 0 }),
      s({ id: "b", time: "18:00", sort_order: 1 }),
    ];
    const res = duplicateSessionAfter(list, 1)!; // duplicate "a"
    expect(displayIds(res.sessions)).toEqual(["a", "copy:17:00", "b", "c"]);
  });

  it("keeps the copy in the original's section and date", () => {
    const list = [
      s({ id: "m1", section: "Men's Side", label: "Class 1", sort_order: 0 }),
      s({ id: "w1", section: "Women's Side", label: "Class 1", sort_order: 1 }),
      s({ id: "m2", section: "Men's Side", label: "Class 2", sort_order: 2 }),
      s({ id: "x", session_date: "2026-10-15", day_of_week: 4, sort_order: 3 }),
    ];
    const res = duplicateSessionAfter(list, 0)!;
    const copy = res.sessions[res.copyIndex];
    expect(copy).toMatchObject({ section: "Men's Side", label: "Class 1", session_date: "2026-10-08" });
    expect(displayIds(res.sessions)).toEqual(["m1", "copy:17:00", "m2", "w1", "x"]);
  });

  it("does not mutate the input and returns null for a bad index", () => {
    const list = [s({ id: "a" })];
    const snapshot = JSON.stringify(list);
    duplicateSessionAfter(list, 0);
    expect(JSON.stringify(list)).toBe(snapshot);
    expect(duplicateSessionAfter(list, 5)).toBeNull();
  });
});

describe("applyCapacityDrafts", () => {
  it("commits a pending Spots draft so a duplicate carries it", () => {
    const list = [s({ id: "a", capacity: 4 })];
    const committed = applyCapacityDrafts(list, { 0: "12" });
    expect(committed[0].capacity).toBe(12);
    expect(duplicateSessionAfter(committed, 0)!.sessions[1].capacity).toBe(12);
  });

  it("treats an empty or zero draft as 1, and leaves sessions alone with no drafts", () => {
    const list = [s({ id: "a", capacity: 4 }), s({ id: "b", capacity: 4 })];
    const out = applyCapacityDrafts(list, { 0: "", 1: "0" });
    expect(out.map((x) => x.capacity)).toEqual([1, 1]);
    expect(applyCapacityDrafts(list, {})).toBe(list);
  });
});

describe("sharedLocations and cardLocation", () => {
  const group = (list: EditSession[]) => groupSessionsForDisplay(list)[0];

  it("shows a location shared by the whole day once, not on cards", () => {
    const list = [s({ location: "Stake Center" }), s({ location: "Stake Center ", time: "18:00" })];
    const shared = sharedLocations(group(list));
    expect(shared.day).toBe("Stake Center");
    list.forEach((x) => expect(cardLocation(x, shared)).toBeNull());
  });

  it("shows a per section location under the section when sections differ", () => {
    const list = [
      s({ section: "Men's Side", location: "Room A", sort_order: 0 }),
      s({ section: "Men's Side", location: "Room A", sort_order: 1 }),
      s({ section: "Women's Side", location: "Room B", sort_order: 2 }),
    ];
    const shared = sharedLocations(group(list));
    expect(shared.day).toBeNull();
    expect(shared.bySection).toEqual({ "Men's Side": "Room A", "Women's Side": "Room B" });
    list.forEach((x) => expect(cardLocation(x, shared)).toBeNull());
  });

  it("shows a location on a card only when it differs from its group", () => {
    const list = [
      s({ section: "Men's Side", location: "Room A", sort_order: 0 }),
      s({ section: "Men's Side", location: "Room C", sort_order: 1 }),
      s({ location: "", sort_order: 2 }),
    ];
    const shared = sharedLocations(group(list));
    expect(shared.day).toBeNull();
    expect(shared.bySection).toEqual({});
    expect(cardLocation(list[0], shared)).toBe("Room A");
    expect(cardLocation(list[1], shared)).toBe("Room C");
    expect(cardLocation(list[2], shared)).toBeNull();
  });
});

describe("remove confirmation copy", () => {
  it("slot with several signups", () => {
    expect(removeSlotConfirmBody(3)).toBe(
      "3 people are signed up for this slot. Removing it removes their signups when you save.",
    );
  });

  it("slot with one signup", () => {
    expect(removeSlotConfirmBody(1)).toBe(
      "1 person is signed up for this slot. Removing it removes their signup when you save.",
    );
  });

  it("day with and without signups", () => {
    expect(removeDayConfirmBody(3, 5)).toBe("This removes 3 slots and 5 signups on this day. Changes apply when you save.");
    expect(removeDayConfirmBody(1, 1)).toBe("This removes 1 slot and 1 signup on this day. Changes apply when you save.");
    expect(removeDayConfirmBody(2, 0)).toBe("This removes 2 slots. No one has signed up yet. Changes apply when you save.");
  });

  it("new copy has no dashes", () => {
    [removeSlotConfirmBody(1), removeSlotConfirmBody(4), removeDayConfirmBody(2, 3), removeDayConfirmBody(2, 0)].forEach((t) =>
      expect(t).not.toMatch(/[-–—]/),
    );
  });
});
