/**
 * Maps the AI extractor's result shape (AiEventResult) onto a
 * Partial<CreateFormState>, so a single helper feeds both the legacy and v2
 * create flows without duplicating template-mapping logic.
 */

import type { AiEventResult } from "@/lib/ai-event-extraction";
import type { CreateFormState } from "@/lib/create-form-state";

export function aiResultToFormPatch(ai: AiEventResult): Partial<CreateFormState> {
  const base: Partial<CreateFormState> = {};
  if (ai.eventName) base.name = ai.eventName;
  if (ai.eventDescription) base.description = ai.eventDescription;

  switch (ai.templateType) {
    case "rsvp": {
      const multiDay = !!(ai.rangeStart && ai.rangeEnd && ai.rangeStart !== ai.rangeEnd);
      return {
        ...base,
        eventType: "rsvp",
        date: ai.rangeStart ?? "",
        multiDay,
        endDate: multiDay ? (ai.rangeEnd ?? "") : "",
      };
    }

    case "items": {
      const items = (ai.aiItems ?? []).map((it) => ({
        label: it.label,
        itemLimit: it.quantity > 0 ? it.quantity : null,
      }));
      return {
        ...base,
        eventType: "items",
        items,
        // If AI gave a date, treat it as the event date. Items events keep their
        // date optional, so leaving date blank is fine when AI didn't extract one.
        date: ai.rangeStart ?? "",
      };
    }

    case "missionary-dinners":
      return {
        ...base,
        eventType: "spots",
        spotsDateMode: "range",
        spotsRangeStart: ai.rangeStart ?? "",
        spotsRangeEnd: ai.rangeEnd ?? "",
        spotsWeekdays: [0, 1, 2, 3, 4, 5, 6],
        spotsStartTime: ai.missionaryStartTime ?? "",
        spotsEndTime: ai.missionaryEndTime ?? "",
        spotsAutoSplit: false,
        spotsCapacity: 1,
      };

    case "tithing-declaration":
      return {
        ...base,
        eventType: "spots",
        spotsDateMode: "range",
        spotsRangeStart: ai.rangeStart ?? "",
        spotsRangeEnd: ai.rangeEnd ?? "",
        spotsWeekdays: ai.tithingDays && ai.tithingDays.length > 0 ? ai.tithingDays : [0],
        spotsStartTime: ai.tithingStartTime ?? "",
        spotsEndTime: ai.tithingEndTime ?? "",
        spotsAutoSplit: true,
        spotsSlotDuration: ai.tithingDuration && ai.tithingDuration > 0 ? ai.tithingDuration : 15,
        spotsCapacity: ai.tithingCapacity && ai.tithingCapacity > 0 ? ai.tithingCapacity : 1,
      };

    case "spots":
    default: {
      const cap = ai.spotsCapacity && ai.spotsCapacity > 0 ? ai.spotsCapacity : 1;
      return {
        ...base,
        eventType: "spots",
        spotsDateMode: "range",
        spotsRangeStart: ai.rangeStart ?? "",
        spotsRangeEnd: ai.rangeEnd ?? "",
        spotsWeekdays: ai.spotsDays ?? [],
        spotsStartTime: ai.spotsStartTime ?? "",
        spotsEndTime: ai.spotsEndTime ?? "",
        spotsAutoSplit: false,
        spotsCapacity: cap,
      };
    }
  }
}
