/**
 * Unit tests for Google Calendar sync — event body builder and content hash.
 */

import { createHash } from "crypto";
import {
  googleDateTimesForSession,
  toWallTime,
  userFacingCalendarSyncError,
} from "@/lib/google-calendar-sync-format";

// Test data structures
interface GoogleEvent {
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  extendedProperties?: {
    private?: {
      wardsignup_session_id?: string;
    };
  };
  attendees?: Array<{ email: string }>;
}

interface SessionWithSignups {
  id: string;
  session_date: string | null;
  time: string;
  end_time: string | null;
  label: string | null;
  signups: Array<{
    member_name: string;
    member_email: string | null;
    member_phone: string | null;
    guest_names: string[];
    signup_note: string | null;
  }>;
}

// Helper functions extracted from the sync module
function buildGoogleEvent(
  campaign: any,
  session: SessionWithSignups,
  inviteLeader: boolean
): GoogleEvent {
  const signups = session.signups || [];
  const timezone = campaign.event_timezone || "America/Denver";

  // Title: event name + first signup name (or "Multiple signups")
  const firstName = signups[0]?.member_name || "Unknown";
  const title = signups.length === 1
    ? `${campaign.name} — ${firstName}`
    : `${campaign.name} — ${firstName} + ${signups.length - 1} more`;

  // Description: member details + admin link
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://wardsignup.com";
  const adminUrl = `${siteUrl}/admin/${campaign.id}`;
  
  let description = `${campaign.name}\n\n`;
  
  if (session.label) {
    description += `Time slot: ${session.label}\n\n`;
  }

  description += "Signups:\n";
  for (const signup of signups) {
    description += `\n• ${signup.member_name}`;
    if (signup.member_phone) {
      description += `\n  Phone: ${signup.member_phone}`;
    }
    if (signup.member_email) {
      description += `\n  Email: ${signup.member_email}`;
    }
    if (signup.guest_names && signup.guest_names.length > 0) {
      description += `\n  Guests: ${signup.guest_names.join(", ")}`;
    }
    if (signup.signup_note) {
      description += `\n  Note: ${signup.signup_note}`;
    }
  }

  description += `\n\nManage signups: ${adminUrl}`;

  const { startDateTime, endDateTime } = googleDateTimesForSession({
    session_date: session.session_date as string,
    time: session.time,
    end_time: session.end_time,
  });

  const event: GoogleEvent = {
    summary: title,
    description,
    start: {
      dateTime: startDateTime,
      timeZone: timezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: timezone,
    },
    extendedProperties: {
      private: {
        wardsignup_session_id: session.id,
      },
    },
  };

  // Add leader as attendee if enabled
  if (inviteLeader && campaign.leader_email) {
    event.attendees = [{ email: campaign.leader_email }];
  }

  return event;
}

function computeContentHash(event: GoogleEvent): string {
  const canonical = JSON.stringify({
    summary: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    attendees: event.attendees || [],
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

describe("Google Calendar sync", () => {
  describe("buildGoogleEvent", () => {
    const campaign = {
      id: "campaign-123",
      name: "Tithing Declaration",
      event_timezone: "America/Phoenix",
      leader_email: "bishop@example.com",
    };

    const session: SessionWithSignups = {
      id: "session-456",
      session_date: "2026-12-15",
      time: "09:00",
      end_time: "09:15",
      label: "9:00 AM",
      signups: [
        {
          member_name: "John Smith",
          member_email: "john@example.com",
          member_phone: "555-1234",
          guest_names: ["Jane Smith"],
          signup_note: "Prefer Spanish",
        },
      ],
    };

    it("builds event with single signup", () => {
      const event = buildGoogleEvent(campaign, session, false);

      expect(event.summary).toBe("Tithing Declaration — John Smith");
      expect(event.description).toContain("John Smith");
      expect(event.description).toContain("Phone: 555-1234");
      expect(event.description).toContain("Email: john@example.com");
      expect(event.description).toContain("Guests: Jane Smith");
      expect(event.description).toContain("Note: Prefer Spanish");
      expect(event.description).toContain("/admin/campaign-123");
      expect(event.start.dateTime).toBe("2026-12-15T09:00:00");
      expect(event.end.dateTime).toBe("2026-12-15T09:15:00");
      expect(event.start.timeZone).toBe("America/Phoenix");
      expect(event.extendedProperties?.private?.wardsignup_session_id).toBe("session-456");
      expect(event.attendees).toBeUndefined();
    });

    it("builds event with multiple signups", () => {
      const sessionMulti: SessionWithSignups = {
        ...session,
        signups: [
          ...session.signups,
          {
            member_name: "Jane Doe",
            member_email: null,
            member_phone: null,
            guest_names: [],
            signup_note: null,
          },
        ],
      };

      const event = buildGoogleEvent(campaign, sessionMulti, false);

      expect(event.summary).toBe("Tithing Declaration — John Smith + 1 more");
      expect(event.description).toContain("John Smith");
      expect(event.description).toContain("Jane Doe");
    });

    it("includes leader as attendee when enabled", () => {
      const event = buildGoogleEvent(campaign, session, true);

      expect(event.attendees).toEqual([{ email: "bishop@example.com" }]);
    });

    it("omits PII from title", () => {
      const event = buildGoogleEvent(campaign, session, false);

      // Email and phone should never appear in title
      expect(event.summary).not.toContain("john@example.com");
      expect(event.summary).not.toContain("555-1234");
    });
  });

  describe("computeContentHash", () => {
    it("produces stable hash for identical events", () => {
      const event: GoogleEvent = {
        summary: "Test Event",
        description: "Test description",
        start: {
          dateTime: "2026-12-15T09:00:00Z",
          timeZone: "America/Phoenix",
        },
        end: {
          dateTime: "2026-12-15T09:15:00Z",
          timeZone: "America/Phoenix",
        },
      };

      const hash1 = computeContentHash(event);
      const hash2 = computeContentHash(event);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it("produces different hash when content changes", () => {
      const event1: GoogleEvent = {
        summary: "Test Event",
        description: "Test description",
        start: {
          dateTime: "2026-12-15T09:00:00Z",
          timeZone: "America/Phoenix",
        },
        end: {
          dateTime: "2026-12-15T09:15:00Z",
          timeZone: "America/Phoenix",
        },
      };

      const event2: GoogleEvent = {
        ...event1,
        description: "Different description",
      };

      const hash1 = computeContentHash(event1);
      const hash2 = computeContentHash(event2);

      expect(hash1).not.toBe(hash2);
    });

    it("includes attendees in hash", () => {
      const event1: GoogleEvent = {
        summary: "Test Event",
        description: "Test description",
        start: {
          dateTime: "2026-12-15T09:00:00Z",
          timeZone: "America/Phoenix",
        },
        end: {
          dateTime: "2026-12-15T09:15:00Z",
          timeZone: "America/Phoenix",
        },
      };

      const event2: GoogleEvent = {
        ...event1,
        attendees: [{ email: "test@example.com" }],
      };

      const hash1 = computeContentHash(event1);
      const hash2 = computeContentHash(event2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("session wall times", () => {
    it("pads HH:mm into a local dateTime", () => {
      expect(toWallTime("9:00")).toBe("09:00:00");
      expect(googleDateTimesForSession({
        session_date: "2026-12-15",
        time: "09:00",
        end_time: null,
      })).toEqual({
        startDateTime: "2026-12-15T09:00:00",
        endDateTime: "2026-12-15T10:00:00",
      });
    });
  });

  describe("userFacingCalendarSyncError", () => {
    it("hides database column names", () => {
      expect(
        userFacingCalendarSyncError("Failed to load sessions: column sessions.start_time does not exist")
      ).toBe("Could not load this event's time slots. Please try again.");
    });
  });
});
