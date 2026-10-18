/**
 * @jest-environment node
 */

import { generateSpotsSessions, buildDayWindows } from "@/lib/spots-session-generator";
import type { CreateFormState } from "@/lib/create-form-state";

describe("generateSpotsSessions", () => {
  it("handles multiple time windows on the same date", () => {
    const state: Partial<CreateFormState> = {
      spotsDateMode: "specific",
      spotsPickedDates: [
        { id: "1", date: "2026-10-02", start: "10:30", end: "11:15" },
        { id: "2", date: "2026-10-02", start: "14:20", end: "16:00" },
      ],
      spotsAutoSplit: true,
      spotsSlotDuration: 15,
      spotsCapacity: 1,
      spotsSlots: [],
    } as CreateFormState;

    const sessions = generateSpotsSessions(state as CreateFormState);

    // First window: 10:30-11:15 = 45 minutes / 15 = 3 slots
    // Second window: 14:20-16:00 = 100 minutes / 15 = 6 slots (90 minutes of full slots)
    expect(sessions).toHaveLength(9);

    // Check first window slots
    expect(sessions[0]).toMatchObject({
      time: "10:30",
      end_time: "10:45",
      session_date: "2026-10-02",
    });
    expect(sessions[1]).toMatchObject({
      time: "10:45",
      end_time: "11:00",
      session_date: "2026-10-02",
    });
    expect(sessions[2]).toMatchObject({
      time: "11:00",
      end_time: "11:15",
      session_date: "2026-10-02",
    });

    // Check second window slots
    expect(sessions[3]).toMatchObject({
      time: "14:20",
      end_time: "14:35",
      session_date: "2026-10-02",
    });
    expect(sessions[8]).toMatchObject({
      time: "15:35",
      end_time: "15:50",
      session_date: "2026-10-02",
    });
  });

  it("handles multiple windows with different slot durations", () => {
    const state: Partial<CreateFormState> = {
      spotsDateMode: "specific",
      spotsPickedDates: [
        { id: "1", date: "2026-10-02", start: "10:30", end: "11:15" },
        { id: "2", date: "2026-10-02", start: "14:20", end: "16:00" },
      ],
      spotsAutoSplit: true,
      spotsSlotDuration: 20,
      spotsCapacity: 1,
      spotsSlots: [],
    } as CreateFormState;

    const sessions = generateSpotsSessions(state as CreateFormState);

    // First window: 10:30-11:15 = 45 minutes / 20 = 2 slots (leaves 5 min)
    // Second window: 14:20-16:00 = 100 minutes / 20 = 5 slots
    expect(sessions).toHaveLength(7);

    // Check first window
    expect(sessions[0]).toMatchObject({
      time: "10:30",
      end_time: "10:50",
    });
    expect(sessions[1]).toMatchObject({
      time: "10:50",
      end_time: "11:10",
    });

    // Check second window
    expect(sessions[2]).toMatchObject({
      time: "14:20",
      end_time: "14:40",
    });
    expect(sessions[6]).toMatchObject({
      time: "15:40",
      end_time: "16:00",
    });
  });

  it("handles multiple windows without auto-split", () => {
    const state: Partial<CreateFormState> = {
      spotsDateMode: "specific",
      spotsPickedDates: [
        { id: "1", date: "2026-10-02", start: "10:30", end: "11:15" },
        { id: "2", date: "2026-10-02", start: "14:20", end: "16:00" },
      ],
      spotsAutoSplit: false,
      spotsCapacity: 5,
      spotsSlots: [],
    } as CreateFormState;

    const sessions = generateSpotsSessions(state as CreateFormState);

    // Without auto-split, each window becomes one session
    expect(sessions).toHaveLength(2);

    expect(sessions[0]).toMatchObject({
      time: "10:30",
      end_time: "11:15",
      capacity: 5,
      session_date: "2026-10-02",
    });
    expect(sessions[1]).toMatchObject({
      time: "14:20",
      end_time: "16:00",
      capacity: 5,
      session_date: "2026-10-02",
    });
  });

  it("handles multiple dates each with multiple windows", () => {
    const state: Partial<CreateFormState> = {
      spotsDateMode: "specific",
      spotsPickedDates: [
        { id: "1", date: "2026-10-02", start: "10:00", end: "11:00" },
        { id: "2", date: "2026-10-02", start: "14:00", end: "15:00" },
        { id: "3", date: "2026-10-03", start: "10:00", end: "11:00" },
        { id: "4", date: "2026-10-03", start: "14:00", end: "15:00" },
      ],
      spotsAutoSplit: true,
      spotsSlotDuration: 30,
      spotsCapacity: 1,
      spotsSlots: [],
    } as CreateFormState;

    const sessions = generateSpotsSessions(state as CreateFormState);

    // Each window is 60 minutes / 30 = 2 slots
    // 4 windows × 2 slots = 8 total
    expect(sessions).toHaveLength(8);

    // Check that we have sessions for both dates
    const oct2Sessions = sessions.filter((s) => s.session_date === "2026-10-02");
    const oct3Sessions = sessions.filter((s) => s.session_date === "2026-10-03");
    expect(oct2Sessions).toHaveLength(4);
    expect(oct3Sessions).toHaveLength(4);
  });
});

describe("buildDayWindows", () => {
  it("returns all picked dates with multiple windows per date", () => {
    const state: Partial<CreateFormState> = {
      spotsDateMode: "specific",
      spotsPickedDates: [
        { id: "1", date: "2026-10-02", start: "10:30", end: "11:15" },
        { id: "2", date: "2026-10-02", start: "14:20", end: "16:00" },
        { id: "3", date: "2026-10-03", start: "09:00", end: "10:00" },
      ],
    } as CreateFormState;

    const windows = buildDayWindows(state as CreateFormState);

    expect(windows).toHaveLength(3);
    expect(windows[0]).toEqual({ date: "2026-10-02", start: "10:30", end: "11:15" });
    expect(windows[1]).toEqual({ date: "2026-10-02", start: "14:20", end: "16:00" });
    expect(windows[2]).toEqual({ date: "2026-10-03", start: "09:00", end: "10:00" });
  });
});
