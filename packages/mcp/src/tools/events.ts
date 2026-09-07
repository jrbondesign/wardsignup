import { z } from "zod";
import { apiCall, apiUrl } from "../client.js";

export const eventTools = [
  {
    name: "list_events",
    description: "List all sign-up events for the organizer account.",
    inputSchema: z.object({}),
    async handler() {
      const { events } = await apiCall<{ events: unknown[] }>("/api/events");
      if (!events.length) return "No events found. Create one with create_event or create_event_from_description.";
      const lines = (events as { id: string; name: string; event_type: string; created_at: string }[]).map(
        (e) => `• [${e.event_type}] ${e.name} (id: ${e.id}) — created ${e.created_at.slice(0, 10)}\n  URL: ${apiUrl}/event/${e.id}`,
      );
      return lines.join("\n");
    },
  },

  {
    name: "create_event",
    description: "Create a new sign-up event. Use create_event_from_description instead when you have a natural language description.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Event name"),
      description: z.string().optional().describe("Optional event description"),
      event_type: z.enum(["spots", "items"]).describe("'spots' = time-slot sign-ups, 'items' = claim items/tasks"),
      event_timezone: z.string().optional().describe("IANA timezone, e.g. 'America/Denver'. Omit to use organizer default."),
    }),
    async handler(input: { name: string; description?: string; event_type: "spots" | "items"; event_timezone?: string }) {
      const { event } = await apiCall<{ event: { id: string; name: string } }>("/api/events", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return `Created event "${event.name}" (id: ${event.id})\nURL: ${apiUrl}/event/${event.id}`;
    },
  },

  {
    name: "update_event",
    description: "Update an event's name, description, or notification preferences.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
      name: z.string().optional().describe("New event name"),
      description: z.string().optional().describe("New event description"),
      digest_enabled: z.boolean().optional().describe("Whether to receive daily digest emails"),
      instant_notify_enabled: z.boolean().optional().describe("Whether to receive instant signup notifications"),
    }),
    async handler(input: { event_id: string; name?: string; description?: string; digest_enabled?: boolean; instant_notify_enabled?: boolean }) {
      const { event_id, ...updates } = input;
      const { event } = await apiCall<{ event: { id: string; name: string } }>(`/api/events/${event_id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      return `Updated event "${event.name}" (id: ${event.id})`;
    },
  },

  {
    name: "delete_event",
    description: "Permanently delete an event and all its sessions, items, and signups. This cannot be undone.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID to delete"),
      confirm: z.literal(true).describe("Must be true to confirm deletion"),
    }),
    async handler(input: { event_id: string; confirm: true }) {
      await apiCall(`/api/events/${input.event_id}`, { method: "DELETE" });
      return `Event ${input.event_id} deleted successfully.`;
    },
  },
] as const;
