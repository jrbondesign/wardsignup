import Anthropic from "@anthropic-ai/sdk";
import type { BrandId } from "@/lib/brand/types";

export type AiItem = { label: string; quantity: number };

export type AiEventResult = {
  templateType: "missionary-dinners" | "tithing-declaration" | "spots" | "items" | "rsvp";
  eventName: string | null;
  eventDescription: string | null;
  // Date range (ISO "YYYY-MM-DD")
  rangeStart: string | null;
  rangeEnd: string | null;
  // Missionary Dinners
  missionaryStartTime: string | null;  // "HH:MM" 24h
  missionaryEndTime: string | null;
  // Tithing Declaration
  tithingDays: number[] | null;        // 0=Sun … 6=Sat
  tithingStartTime: string | null;
  tithingEndTime: string | null;
  tithingDuration: number | null;      // minutes per slot
  tithingCapacity: number | null;      // people per slot
  // General spots events
  spotsDays: number[] | null;          // 0=Sun … 6=Sat (for recurring spots)
  spotsStartTime: string | null;       // "HH:MM" 24h
  spotsEndTime: string | null;         // "HH:MM" 24h
  spotsCapacity: number | null;        // people per slot
  // Items events
  aiItems: AiItem[] | null;            // extracted items with quantities
};

const LDS_TEMPLATE_TYPES = ["missionary-dinners", "tithing-declaration", "spots", "items", "rsvp"] as const;
const GENERAL_TEMPLATE_TYPES = ["spots", "items", "rsvp"] as const;

function getSystemPrompt(brandId: BrandId, today: string): string {
  if (brandId === "wardsignup") {
    return `You are a structured-data extractor for an LDS ward sign-up app (wardsignup.com).
Today is ${today}. Extract event details from the user's description by calling the extract_event function.

templateType rules:
- "missionary-dinners": scheduling which families host missionaries for dinner on which days (one family per slot, rotating across dates)
- "tithing-declaration": appointment/interview scheduling (tithing, bishop interviews, etc.)
- "items": people sign up to bring or provide specific things (food items, supplies, roles) — use this when the sign-up is about WHAT people bring, not WHEN they come
- "rsvp": a single event where people register to attend — campout, fireside, service day, trip, ward party. One sign-up slot total.
- "spots": recurring or multi-session sign-ups by date/time slot (weekly cleaning shifts, recurring dinners, etc.)

Key distinction: "bring rolls, bring drinks, set up tables" → "items". "Host missionaries on Tuesday" → "missionary-dinners". "Fathers and Sons campout" → "rsvp". "Cleaning crew every Saturday" → "spots".

Date rules:
- Resolve relative language to concrete ISO dates (YYYY-MM-DD)
- "every Sunday in May" → rangeStart = first Sunday in May, rangeEnd = last Saturday of May
- "two weeks" starting from the next Sunday → rangeStart = next Sunday, rangeEnd = Saturday 13 days later
- If no year given, assume current or next upcoming occurrence
- Omit fields you cannot determine — do not hallucinate dates

Time rules:
- Output 24-hour "HH:MM" strings (e.g. 6pm → "18:00", noon → "12:00")
- If only start time is given, set end time to 1 hour later for missionary dinners

Items rules (for "items" templateType only):
- Extract each distinct item/task as a separate aiItems entry
- Set quantity to the number of people who should sign up for that item
- If no quantity is stated, use 1`;
  }

  return `You are a structured-data extractor for a church ministry sign-up app (ministrysignup.com).
Today is ${today}. Extract event details from the user's description by calling the extract_event function.

templateType rules:
- "spots": sign-up by date/time slot (services, shifts, classes, meals, appointments, etc.)
- "items": sign-up by item (bring a dish, supply something, volunteer for a specific role)

Date rules:
- Resolve relative language to concrete ISO dates (YYYY-MM-DD)
- If no year given, assume current or next upcoming occurrence
- Omit fields you cannot determine — do not hallucinate dates

Time rules:
- Output 24-hour "HH:MM" strings (e.g. 6pm → "18:00", noon → "12:00")

Items rules (for "items" templateType only):
- Extract each distinct item/task as a separate aiItems entry
- Set quantity to the number of people who should sign up for that item
- If no quantity is stated, use 1`;
}

function buildTool(brandId: BrandId): Anthropic.Tool {
  const templateTypeEnum = brandId === "wardsignup"
    ? LDS_TEMPLATE_TYPES
    : GENERAL_TEMPLATE_TYPES;

  return {
    name: "extract_event",
    description: "Extract structured event details from the user's natural language description.",
    input_schema: {
      type: "object" as const,
      properties: {
        templateType: {
          type: "string",
          enum: templateTypeEnum,
          description: "The event template type that best matches the description.",
        },
        eventName: {
          type: "string",
          description: "Short, natural event name (under 60 characters). Generate one if not stated.",
        },
        eventDescription: {
          type: "string",
          description: "1-3 sentence description using the user's own words, lightly cleaned up.",
        },
        rangeStart: {
          type: "string",
          description: "Start date of the event range in YYYY-MM-DD format. Omit if unknown.",
        },
        rangeEnd: {
          type: "string",
          description: "End date of the event range in YYYY-MM-DD format. Omit if unknown.",
        },
        missionaryStartTime: {
          type: "string",
          description: "Start time in HH:MM 24h format, for missionary-dinners only. Omit if not applicable or unknown.",
        },
        missionaryEndTime: {
          type: "string",
          description: "End time in HH:MM 24h format, for missionary-dinners only. Omit if not applicable or unknown.",
        },
        tithingDays: {
          type: "array",
          items: { type: "number" },
          description: "Days of week as integers (0=Sun, 1=Mon, …, 6=Sat), for tithing-declaration only. Omit if not applicable.",
        },
        tithingStartTime: {
          type: "string",
          description: "Window start time HH:MM 24h, for tithing-declaration only. Omit if not applicable or unknown.",
        },
        tithingEndTime: {
          type: "string",
          description: "Window end time HH:MM 24h, for tithing-declaration only. Omit if not applicable or unknown.",
        },
        tithingDuration: {
          type: "number",
          description: "Slot duration in minutes, for tithing-declaration only. Omit if not applicable or unknown.",
        },
        tithingCapacity: {
          type: "number",
          description: "People per slot, for tithing-declaration only. Omit if not applicable or unknown.",
        },
        spotsDays: {
          type: "array",
          items: { type: "number" },
          description: "Days of week as integers (0=Sun, 1=Mon, …, 6=Sat) for recurring spots events. Omit if not recurring on specific days.",
        },
        spotsStartTime: {
          type: "string",
          description: "Start time HH:MM 24h for spots events. Omit if not applicable or unknown.",
        },
        spotsEndTime: {
          type: "string",
          description: "End time HH:MM 24h for spots events. Omit if not applicable or unknown.",
        },
        spotsCapacity: {
          type: "number",
          description: "Number of people per slot/session for spots events. Omit if not specified.",
        },
        aiItems: {
          type: "array",
          description: "For items-type events only: each distinct item or task people can sign up for.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Name of the item or task (e.g. 'Rolls & Salad', 'Set up tables', 'Drinks').",
              },
              quantity: {
                type: "number",
                description: "How many people should sign up for this item. Use 1 if not specified.",
              },
            },
            required: ["label", "quantity"],
          },
        },
      },
      required: ["templateType"],
    },
  };
}

export function computeMissingFields(result: AiEventResult): string[] {
  const missing: string[] = [];
  if (!result.eventName) missing.push("event name");
  if (result.templateType !== "items" && (!result.rangeStart || !result.rangeEnd)) {
    missing.push("date range");
  }
  if (result.templateType === "missionary-dinners") {
    if (!result.missionaryStartTime) missing.push("start time");
  }
  if (result.templateType === "tithing-declaration") {
    if (!result.tithingDays?.length) missing.push("days of week");
    if (!result.tithingStartTime || !result.tithingEndTime) missing.push("appointment window");
  }
  if (result.templateType === "items") {
    if (!result.aiItems?.length) missing.push("items list");
  }
  return missing;
}

export async function extractEventFromDescription(
  description: string,
  brandId: BrandId,
): Promise<AiEventResult> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const today = new Date().toISOString().split("T")[0];

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: getSystemPrompt(brandId, today),
    tools: [buildTool(brandId)],
    tool_choice: { type: "tool", name: "extract_event" },
    messages: [{ role: "user", content: description }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("No tool call returned from Claude");
  }

  const input = toolUse.input as Record<string, unknown>;

  const rawItems = Array.isArray(input.aiItems) ? input.aiItems as Record<string, unknown>[] : null;

  const result: AiEventResult = {
    templateType: (input.templateType as AiEventResult["templateType"]) ?? "spots",
    eventName: typeof input.eventName === "string" ? input.eventName : null,
    eventDescription: typeof input.eventDescription === "string" ? input.eventDescription : null,
    rangeStart: typeof input.rangeStart === "string" ? input.rangeStart : null,
    rangeEnd: typeof input.rangeEnd === "string" ? input.rangeEnd : null,
    missionaryStartTime: typeof input.missionaryStartTime === "string" ? input.missionaryStartTime : null,
    missionaryEndTime: typeof input.missionaryEndTime === "string" ? input.missionaryEndTime : null,
    tithingDays: Array.isArray(input.tithingDays) ? (input.tithingDays as number[]) : null,
    tithingStartTime: typeof input.tithingStartTime === "string" ? input.tithingStartTime : null,
    tithingEndTime: typeof input.tithingEndTime === "string" ? input.tithingEndTime : null,
    tithingDuration: typeof input.tithingDuration === "number" ? input.tithingDuration : null,
    tithingCapacity: typeof input.tithingCapacity === "number" ? input.tithingCapacity : null,
    spotsDays: Array.isArray(input.spotsDays) ? (input.spotsDays as number[]) : null,
    spotsStartTime: typeof input.spotsStartTime === "string" ? input.spotsStartTime : null,
    spotsEndTime: typeof input.spotsEndTime === "string" ? input.spotsEndTime : null,
    spotsCapacity: typeof input.spotsCapacity === "number" ? input.spotsCapacity : null,
    aiItems: rawItems
      ? rawItems
          .filter((it) => typeof it.label === "string" && typeof it.quantity === "number")
          .map((it) => ({ label: it.label as string, quantity: it.quantity as number }))
      : null,
  };

  return result;
}
