import { z } from "zod";
import { apiCall, apiUrl, brandId } from "../client.js";

interface AiItem { label: string; quantity: number }
interface AiEventResult {
  templateType: "missionary-dinners" | "tithing-declaration" | "spots" | "items";
  eventName: string | null;
  eventDescription: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  missionaryStartTime: string | null;
  missionaryEndTime: string | null;
  tithingDays: number[] | null;
  tithingStartTime: string | null;
  tithingEndTime: string | null;
  tithingDuration: number | null;
  tithingCapacity: number | null;
  spotsDays: number[] | null;
  spotsStartTime: string | null;
  spotsEndTime: string | null;
  spotsCapacity: number | null;
  aiItems: AiItem[] | null;
}

/** Generate ISO date strings for days-of-week within a date range */
function buildSessionDates(
  rangeStart: string,
  rangeEnd: string,
  days: number[], // 0=Sun … 6=Sat; empty = every day
  startTime: string,
  endTime: string,
  capacity: number,
): { session_date: string; day_of_week: number; time: string; end_time: string; capacity: number }[] {
  const sessions: { session_date: string; day_of_week: number; time: string; end_time: string; capacity: number }[] = [];
  const start = new Date(rangeStart + "T12:00:00");
  const end = new Date(rangeEnd + "T12:00:00");
  const cur = new Date(start);

  while (cur <= end) {
    const dow = cur.getDay();
    if (days.length === 0 || days.includes(dow)) {
      sessions.push({
        session_date: cur.toISOString().slice(0, 10),
        day_of_week: dow,
        time: startTime,
        end_time: endTime,
        capacity,
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return sessions;
}

export const aiTools = [
  {
    name: "create_event_from_description",
    description:
      "The primary way to create events. Describe what you need in plain English — the AI extracts the details, " +
      "creates the event, and sets up sessions or items automatically. Returns the shareable event URL.",
    inputSchema: z.object({
      description: z
        .string()
        .min(10)
        .max(500)
        .describe(
          "Natural language description of the event. Include: what it is, when/dates, times, how many people needed, " +
          "and (for items events) what items or tasks are needed with quantities.",
        ),
    }),
    async handler(input: { description: string }) {
      // Step 1: AI extraction
      const { result, missingFields } = await apiCall<{ result: AiEventResult; missingFields: string[] }>(
        "/api/ai-create-event",
        {
          method: "POST",
          body: JSON.stringify({ description: input.description, brandId }),
        },
      );

      const isItems = result.templateType === "items";
      const eventType = isItems ? "items" : "spots";

      // Step 2: Create the event
      const { event } = await apiCall<{ event: { id: string; name: string } }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: result.eventName ?? "New Event",
          description: result.eventDescription ?? null,
          event_type: eventType,
        }),
      });

      const eventUrl = `${apiUrl}/event/${event.id}`;
      const lines: string[] = [`✓ Created event "${event.name}"`, `  URL: ${eventUrl}`];

      // Step 3a: Items event — POST items
      if (isItems && result.aiItems?.length) {
        try {
          const { items } = await apiCall<{ items: { id: string }[] }>("/api/items", {
            method: "POST",
            body: JSON.stringify({
              campaign_id: event.id,
              items: result.aiItems.map((it) => ({
                label: it.label,
                item_limit: it.quantity > 0 ? it.quantity : undefined,
              })),
            }),
          });
          lines.push(`✓ Added ${items.length} item(s)`);
        } catch (err) {
          lines.push(`⚠ Event created but items failed to attach: ${err instanceof Error ? err.message : String(err)}`);
          lines.push(`  Add items manually at: ${apiUrl}/setup-items/${event.id}`);
        }
      }

      // Step 3b: Spots event — generate and POST sessions
      if (!isItems && result.rangeStart && result.rangeEnd && result.spotsStartTime) {
        try {
          const days = result.spotsDays ?? [];
          const sessions = buildSessionDates(
            result.rangeStart,
            result.rangeEnd,
            days,
            result.spotsStartTime,
            result.spotsEndTime ?? "",
            result.spotsCapacity ?? 1,
          );
          if (sessions.length) {
            const { sessions: created } = await apiCall<{ sessions: { id: string }[] }>("/api/sessions", {
              method: "POST",
              body: JSON.stringify({ campaign_id: event.id, sessions }),
            });
            lines.push(`✓ Created ${created.length} session(s)`);
          }
        } catch (err) {
          lines.push(`⚠ Event created but sessions failed to attach: ${err instanceof Error ? err.message : String(err)}`);
          lines.push(`  Add sessions manually at: ${apiUrl}/setup/${event.id}`);
        }
      } else if (!isItems && (!result.rangeStart || !result.rangeEnd || !result.spotsStartTime)) {
        lines.push(`⚠ Could not determine date/time — add sessions manually at: ${apiUrl}/setup/${event.id}`);
      }

      // Step 3c: Missionary dinners
      if (result.templateType === "missionary-dinners" && result.rangeStart && result.rangeEnd) {
        try {
          const sessions = buildSessionDates(
            result.rangeStart,
            result.rangeEnd,
            [0], // Sundays
            result.missionaryStartTime ?? "18:00",
            result.missionaryEndTime ?? "19:00",
            1,
          );
          if (sessions.length) {
            const { sessions: created } = await apiCall<{ sessions: { id: string }[] }>("/api/sessions", {
              method: "POST",
              body: JSON.stringify({ campaign_id: event.id, sessions }),
            });
            lines.push(`✓ Created ${created.length} missionary dinner slot(s)`);
          }
        } catch (err) {
          lines.push(`⚠ Event created but dinner slots failed to attach: ${err instanceof Error ? err.message : String(err)}`);
          lines.push(`  Add slots manually at: ${apiUrl}/setup/${event.id}`);
        }
      }

      // Note any missing fields
      if (missingFields.length) {
        lines.push(`\n⚠ Some details weren't found and will need to be added manually: ${missingFields.join(", ")}`);
        lines.push(`  Edit at: ${apiUrl}/setup/${event.id}`);
      }

      return lines.join("\n");
    },
  },
] as const;
