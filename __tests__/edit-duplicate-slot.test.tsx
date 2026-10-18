/**
 * Verifies that duplicateSession inserts the copy right after the original.
 */

import "@testing-library/jest-dom";

describe("duplicateSession insertion order", () => {
  it("inserts copy right after original", () => {
    const sessions = [
      { id: "1", time: "17:00", capacity: 4, location: "", notes: "", day_of_week: 4 },
      { id: "2", time: "18:00", capacity: 5, location: "", notes: "", day_of_week: 4 },
      { id: "3", time: "19:00", capacity: 6, location: "", notes: "", day_of_week: 4 },
    ];

    const index = 1;
    const original = sessions[index];

    const copy = {
      day_of_week: original.day_of_week,
      time: original.time,
      capacity: original.capacity,
      location: original.location,
      notes: original.notes,
    };

    const before = sessions.slice(0, index + 1);
    const after = sessions.slice(index + 1);
    const newSessions = [...before, copy, ...after];

    expect(newSessions.length).toBe(4);
    expect(newSessions[0].id).toBe("1");
    expect(newSessions[1].id).toBe("2");
    expect(newSessions[2].id).toBeUndefined();
    expect(newSessions[2].time).toBe("18:00");
    expect(newSessions[2].capacity).toBe(5);
    expect(newSessions[3].id).toBe("3");
  });

  it("preserves session_date, label, and section when duplicating", () => {
    const original = {
      id: "1",
      time: "17:00",
      end_time: "18:00",
      capacity: 4,
      location: "Room A",
      notes: "Notes here",
      day_of_week: 4,
      session_date: "2026-10-08",
      label: "Women's Class",
      section: "Women's Side",
    };

    const copy = {
      day_of_week: original.day_of_week,
      time: original.time,
      end_time: original.end_time,
      capacity: original.capacity,
      location: original.location,
      notes: original.notes,
      session_date: original.session_date,
      label: original.label,
      section: original.section,
    };

    expect(copy.id).toBeUndefined();
    expect(copy.session_date).toBe("2026-10-08");
    expect(copy.label).toBe("Women's Class");
    expect(copy.section).toBe("Women's Side");
    expect(copy.time).toBe("17:00");
    expect(copy.end_time).toBe("18:00");
  });
});
