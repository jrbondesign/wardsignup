import { z } from "zod";
import { apiCall } from "../client.js";

export const signupTools = [
  {
    name: "list_signups",
    description: "List all spot-signups for an event's sessions.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
    }),
    async handler(input: { event_id: string }) {
      // Fetch sessions with nested signups via the admin view
      const { sessions } = await apiCall<{
        sessions: {
          id: string;
          session_date: string;
          time: string;
          end_time: string | null;
          capacity: number;
          signups: { id: string; member_name: string; member_email: string | null; signed_up_at: string }[];
        }[];
      }>(`/api/admin-view/${input.event_id}/sessions`).catch(() => ({ sessions: [] as never[] }));

      if (!sessions.length) {
        return "No sessions found. Use list_items for items-type events.";
      }

      return sessions
        .map((s) => {
          const filled = s.signups.length;
          const header = `${s.session_date} ${s.time}${s.end_time ? `–${s.end_time}` : ""} (${filled}/${s.capacity})`;
          const names = s.signups.map((sg) => `  - ${sg.member_name}${sg.member_email ? ` <${sg.member_email}>` : ""}`).join("\n");
          return names ? `${header}\n${names}` : `${header}\n  (no signups yet)`;
        })
        .join("\n\n");
    },
  },

  {
    name: "list_item_signups",
    description: "List who has claimed each item in an items-type event.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
    }),
    async handler(input: { event_id: string }) {
      const { items } = await apiCall<{
        items: {
          id: string;
          label: string;
          item_limit: number | null;
          item_signups: { id: string; member_name: string; member_email: string | null; signed_up_at: string }[];
        }[];
      }>(`/api/items?campaign_id=${input.event_id}`);

      if (!items.length) return "No items found for this event.";

      return items
        .map((it) => {
          const limit = it.item_limit ?? "∞";
          const header = `${it.label} (${it.item_signups.length}/${limit})`;
          const names = it.item_signups.map((sg) => `  - ${sg.member_name}${sg.member_email ? ` <${sg.member_email}>` : ""}`).join("\n");
          return names ? `${header}\n${names}` : `${header}\n  (not yet claimed)`;
        })
        .join("\n\n");
    },
  },
] as const;
