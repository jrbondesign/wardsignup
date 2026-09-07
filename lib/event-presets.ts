/**
 * Maps each event template (from event-template-data.ts) to a partial CreateFormState.
 *
 * Templates are now pure presets: clicking one merges these defaults into the form
 * state. After that there's no remembered "current template" — the creator can
 * change anything freely.
 *
 * Template metadata (icons, labels, copy, category, badge colors) still lives in
 * lib/event-template-data.ts. This file only owns the form-state mapping.
 */

import type { TemplateKey } from "@/lib/event-template-data";
import { getEventTemplate } from "@/lib/event-template-data";
import type { CreateFormState, ItemDraft } from "@/lib/create-form-state";

/** Optional UI hints that go alongside the partial state — which inline expanders
 *  should start opened by this preset. */
export interface PresetUiHints {
  expandExtraTimes?: boolean;
  expandExtraLocations?: boolean;
}

export interface PresetResult {
  patch: Partial<CreateFormState>;
  ui: PresetUiHints;
}

/** Build the patch and UI hints for a given template key. */
export function buildPreset(key: TemplateKey): PresetResult {
  const template = getEventTemplate(key);
  if (!template) return { patch: {}, ui: {} };

  // Common fields every template prefills
  const base: Partial<CreateFormState> = {
    name: template.defaultName,
    description: template.defaultDescription,
  };

  switch (key) {
    // ── Single Event (rsvp) ──────────────────────────────────────────────
    case "fathers-sons":
      return {
        patch: {
          ...base,
          eventType: "rsvp",
          allowGuests: true,
          multiDay: true,
        },
        ui: {},
      };

    case "service-day":
      return {
        patch: {
          ...base,
          eventType: "rsvp",
          allowGuests: true,
          hasCapacity: true,
          capacity: 20,
          showCapacityPublicly: true,
        },
        ui: {},
      };

    case "fireside":
      return {
        patch: {
          ...base,
          eventType: "rsvp",
          allowGuests: true,
          hasTime: true,
        },
        ui: {},
      };

    case "temple-trip":
      return {
        patch: {
          ...base,
          eventType: "rsvp",
          allowGuests: false,
          hasCapacity: true,
          capacity: 40,
          showCapacityPublicly: true,
          singleSessionForEntireEvent: true,
        },
        ui: {},
      };

    // ── Scheduled Sessions (spots) ───────────────────────────────────────
    case "tithing-declaration":
      return {
        patch: {
          ...base,
          eventType: "spots",
          allowGuests: false,
          spotsDateMode: "range",
          spotsWeekdays: [0], // Sundays
          spotsStartTime: "15:00",
          spotsEndTime: "17:00",
          spotsAutoSplit: true,
          spotsSlotDuration: 15,
          spotsCapacity: 1,
        },
        ui: {},
      };

    case "missionary-dinners":
      return {
        patch: {
          ...base,
          eventType: "spots",
          allowGuests: false,
          spotsDateMode: "range",
          spotsWeekdays: [0, 1, 2, 3, 4, 5, 6], // every day
          spotsStartTime: "17:00",
          spotsEndTime: "18:00",
          spotsAutoSplit: false,
          spotsCapacity: 1,
        },
        ui: {},
      };

    case "cleaning-crew":
      return {
        patch: {
          ...base,
          eventType: "spots",
          allowGuests: false,
          spotsDateMode: "range",
          spotsWeekdays: [6], // Saturdays
          spotsStartTime: "09:00",
          spotsEndTime: "10:00",
          spotsAutoSplit: false,
          spotsCapacity: 4,
        },
        ui: {},
      };

    case "interviews":
      return {
        patch: {
          ...base,
          eventType: "spots",
          allowGuests: false,
          spotsDateMode: "range",
          spotsWeekdays: [0], // Sundays
          spotsStartTime: "10:00",
          spotsEndTime: "12:00",
          spotsAutoSplit: true,
          spotsSlotDuration: 15,
          spotsCapacity: 1,
        },
        ui: {},
      };

    // ── Bring or Do (items) ──────────────────────────────────────────────
    case "ward-potluck":
    case "service-project":
    case "moving-help": {
      const items: ItemDraft[] =
        template.defaultItems?.map((it) => ({
          label: it.label,
          itemLimit: it.quantity,
        })) ?? [];
      return {
        patch: {
          ...base,
          eventType: "items",
          allowGuests: false,
          items,
        },
        ui: {},
      };
    }
  }
}

/** Apply a preset to the current form state, returning a fresh state object. */
export function applyPreset(state: CreateFormState, key: TemplateKey): CreateFormState {
  const { patch, ui } = buildPreset(key);
  return {
    ...state,
    ...patch,
    expanded: {
      ...state.expanded,
      ...(ui.expandExtraTimes !== undefined ? { extraTimes: ui.expandExtraTimes } : {}),
      ...(ui.expandExtraLocations !== undefined ? { extraLocations: ui.expandExtraLocations } : {}),
    },
  };
}

/** Get the dual-mode alternate description for a template, if it has one.
 *  Used when the creator switches a Bring-or-Do preset to RSVP. */
export function getAlternateRsvpDescription(key: TemplateKey): string | undefined {
  const template = getEventTemplate(key);
  return template?.defaultDescriptionRsvp;
}
