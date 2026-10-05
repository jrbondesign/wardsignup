/**
 * @jest-environment node
 */

import {
  generateTithingDeclarationSessions,
  inferTithingDeclarationConfig,
} from "@/lib/tithing-reschedule";

describe("inferTithingDeclarationConfig", () => {
  it("detects tithing-like schedules and infers defaults", () => {
    const sessions = [
      // Sunday (0), 15:00-17:00, 15 min slots => 8/day
      { day_of_week: 0, time: "15:00", end_time: "15:15", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "15:15", end_time: "15:30", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "15:30", end_time: "15:45", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "15:45", end_time: "16:00", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "16:00", end_time: "16:15", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "16:15", end_time: "16:30", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "16:30", end_time: "16:45", capacity: 1, session_date: "2026-04-05" },
      { day_of_week: 0, time: "16:45", end_time: "17:00", capacity: 1, session_date: "2026-04-05" },
      // Another Sunday date
      { day_of_week: 0, time: "15:00", end_time: "15:15", capacity: 1, session_date: "2026-04-12" },
      { day_of_week: 0, time: "15:15", end_time: "15:30", capacity: 1, session_date: "2026-04-12" },
    ];

    const inferred = inferTithingDeclarationConfig(sessions);
    expect(inferred.isTithingDeclaration).toBe(true);
    expect(inferred.days).toEqual([0]);
    expect(inferred.startTime).toBe("15:00");
    expect(inferred.endTime).toBe("17:00");
    expect(inferred.durationMinutes).toBe(15);
    expect(inferred.capacity).toBe(1);
  });
});

describe("generateTithingDeclarationSessions", () => {
  it("generates expected slot count for range + days", () => {
    const rangeStart = new Date(2026, 3, 5); // 2026-04-05 Sunday
    const rangeEnd = new Date(2026, 3, 11); // 2026-04-11 Saturday
    const sessions = generateTithingDeclarationSessions({
      rangeStart,
      rangeEnd,
      days: [0], // Sundays only => 1 day in range
      startTime: "15:00",
      endTime: "16:00",
      durationMinutes: 15,
      capacity: 1,
      location: "",
      notes: "",
    });

    // 60 minutes / 15 = 4 slots
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toMatchObject({
      day_of_week: 0,
      time: "15:00",
      end_time: "15:15",
      session_date: "2026-04-05",
    });
    expect(sessions[3]).toMatchObject({
      time: "15:45",
      end_time: "16:00",
      session_date: "2026-04-05",
    });
  });

  it("handles non-round start times like 10:30am to 11:15am with 15-min slots", () => {
    const rangeStart = new Date(2026, 9, 5); // 2026-10-05 Monday
    const rangeEnd = new Date(2026, 9, 5); // Same day
    const sessions = generateTithingDeclarationSessions({
      rangeStart,
      rangeEnd,
      days: [1], // Monday only
      startTime: "10:30",
      endTime: "11:15",
      durationMinutes: 15,
      capacity: 1,
      location: "",
      notes: "",
    });

    // 45 minutes / 15 = 3 slots
    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toMatchObject({
      time: "10:30",
      end_time: "10:45",
    });
    expect(sessions[1]).toMatchObject({
      time: "10:45",
      end_time: "11:00",
    });
    expect(sessions[2]).toMatchObject({
      time: "11:00",
      end_time: "11:15",
    });
  });

  it("handles non-round start times like 2:20pm to 4:00pm with 20-min slots", () => {
    const rangeStart = new Date(2026, 9, 5); // 2026-10-05 Monday
    const rangeEnd = new Date(2026, 9, 5); // Same day
    const sessions = generateTithingDeclarationSessions({
      rangeStart,
      rangeEnd,
      days: [1], // Monday only
      startTime: "14:20",
      endTime: "16:00",
      durationMinutes: 20,
      capacity: 1,
      location: "",
      notes: "",
    });

    // 100 minutes / 20 = 5 slots
    expect(sessions).toHaveLength(5);
    expect(sessions[0]).toMatchObject({
      time: "14:20",
      end_time: "14:40",
    });
    expect(sessions[4]).toMatchObject({
      time: "15:40",
      end_time: "16:00",
    });
  });

  it("handles windows that don't divide evenly by slot duration", () => {
    const rangeStart = new Date(2026, 9, 5); // 2026-10-05 Monday
    const rangeEnd = new Date(2026, 9, 5); // Same day
    const sessions = generateTithingDeclarationSessions({
      rangeStart,
      rangeEnd,
      days: [1], // Monday only
      startTime: "10:30",
      endTime: "11:15",
      durationMinutes: 20, // 45 min window, 20 min slots = 2 slots fit, 5 min left over
      capacity: 1,
      location: "",
      notes: "",
    });

    // Only 2 full 20-min slots fit in 45 minutes (leaves 5 minutes)
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      time: "10:30",
      end_time: "10:50",
    });
    expect(sessions[1]).toMatchObject({
      time: "10:50",
      end_time: "11:10",
    });
  });
});

