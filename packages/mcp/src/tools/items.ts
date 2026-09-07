import { z } from "zod";
import { apiCall } from "../client.js";

const ItemInput = z.object({
  label: z.string().min(1).describe("Item or task name, e.g. 'Rolls & Salad', 'Set up chairs'"),
  item_limit: z.number().int().min(1).optional().describe("Max sign-ups for this item. Omit for unlimited."),
});

export const itemTools = [
  {
    name: "list_items",
    description: "List the items/tasks for an items-type event, including signup counts.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
    }),
    async handler(input: { event_id: string }) {
      const { items } = await apiCall<{ items: { id: string; label: string; item_limit: number | null; item_signups: unknown[] }[] }>(
        `/api/items?campaign_id=${input.event_id}`,
      );
      if (!items.length) return "No items found for this event.";
      return items
        .map((it) => {
          const claimed = it.item_signups.length;
          const limit = it.item_limit ?? "∞";
          return `• ${it.label} — ${claimed}/${limit} claimed (id: ${it.id})`;
        })
        .join("\n");
    },
  },

  {
    name: "create_items",
    description: "Add items or tasks to an items-type event.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID (must be an 'items' type event)"),
      items: z.array(ItemInput).min(1).describe("Items/tasks to add"),
    }),
    async handler(input: { event_id: string; items: z.infer<typeof ItemInput>[] }) {
      const { items } = await apiCall<{ items: { id: string }[] }>("/api/items", {
        method: "POST",
        body: JSON.stringify({ campaign_id: input.event_id, items: input.items }),
      });
      return `Created ${items.length} item(s) for event ${input.event_id}.`;
    },
  },

  {
    name: "update_items",
    description: "Replace the items list for an items-type event. Existing items without signups are removed; items with signups are preserved. Pass the full desired list.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
      items: z.array(ItemInput.extend({ id: z.string().uuid().optional().describe("Existing item ID to update (omit for new items)") })).min(1),
    }),
    async handler(input: { event_id: string; items: z.infer<typeof ItemInput>[] }) {
      const { items } = await apiCall<{ items: { id: string }[] }>("/api/items", {
        method: "PUT",
        body: JSON.stringify({ campaign_id: input.event_id, items: input.items }),
      });
      return `Updated items list: ${items.length} item(s) now on event ${input.event_id}.`;
    },
  },
] as const;
