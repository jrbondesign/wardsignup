import { z } from "zod";
import { apiCall } from "../client.js";

const SessionInput = z.object({
  session_date: z.string().describe("Date in YYYY-MM-DD format"),
  time: z.string().describe("Start time in HH:MM 24-hour format, e.g. '18:00'"),
  end_time: z.string().optional().describe("End time in HH:MM 24-hour format"),
  capacity: z.number().int().min(1).default(1).describe("Max number of people who can sign up for this slot"),
  location: z.string().optional().describe("Optional location or meeting link"),
  notes: z.string().optional().describe("Optional notes shown to participants"),
});

export const sessionTools = [
  {
    name: "create_sessions",
    description: "Add time-slot sessions to a spots-type event. Each session is a specific date/time that participants can sign up for.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID (must be a 'spots' type event)"),
      sessions: z.array(SessionInput).min(1).describe("Array of sessions to create"),
    }),
    async handler(input: { event_id: string; sessions: z.infer<typeof SessionInput>[] }) {
      const { sessions } = await apiCall<{ sessions: { id: string }[] }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ campaign_id: input.event_id, sessions: input.sessions }),
      });
      return `Created ${sessions.length} session(s) for event ${input.event_id}.`;
    },
  },

  {
    name: "update_session",
    description: "Update a single session's time, capacity, location, or notes.",
    inputSchema: z.object({
      session_id: z.string().uuid().describe("Session ID"),
      session_date: z.string().optional().describe("New date in YYYY-MM-DD format"),
      time: z.string().optional().describe("New start time in HH:MM 24-hour format"),
      end_time: z.string().optional().describe("New end time in HH:MM 24-hour format"),
      capacity: z.number().int().min(1).optional().describe("New capacity"),
      location: z.string().optional().describe("New location"),
      notes: z.string().optional().describe("New notes"),
    }),
    async handler(input: { session_id: string; [key: string]: unknown }) {
      const { session_id, ...updates } = input;
      const { session } = await apiCall<{ session: { id: string; time: string; session_date: string } }>(
        `/api/sessions/${session_id}`,
        { method: "PATCH", body: JSON.stringify(updates) },
      );
      return `Updated session ${session.id}: ${session.session_date} at ${session.time}`;
    },
  },

  {
    name: "delete_session",
    description: "Delete a session. Only works if the session has no signups.",
    inputSchema: z.object({
      session_id: z.string().uuid().describe("Session ID to delete"),
    }),
    async handler(input: { session_id: string }) {
      await apiCall(`/api/sessions/${input.session_id}`, { method: "DELETE" });
      return `Session ${input.session_id} deleted.`;
    },
  },
] as const;
