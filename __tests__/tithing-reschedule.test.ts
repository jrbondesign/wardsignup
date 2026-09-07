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
});

