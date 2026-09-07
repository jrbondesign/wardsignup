/**
 * @jest-environment node
 */

import { formatSessionSlotLabel } from "@/lib/organizer-email";

describe("formatSessionSlotLabel", () => {
  it("formats dated slot using campaign event timezone when provided", () => {
    const label = formatSessionSlotLabel(
      {
        day_of_week: 3,
        time: "09:00",
        end_time: "10:00",
        session_date: "2026-07-15",
      },
      { eventTimezone: "America/Denver" },
    );
    expect(label).toContain("Jul");
    expect(label).toContain("2026");
    expect(label).toContain("9:00");
    expect(label).toContain("10:00");
  });

  it("falls back to weekday label when no session_date", () => {
    const label = formatSessionSlotLabel({
      day_of_week: 0,
      time: "14:00",
      end_time: null,
      session_date: null,
    });
    expect(label).toMatch(/Sunday/);
  });
});
