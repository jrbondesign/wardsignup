/**
 * Canonical form state for the unified event-creation flow at /create.
 *
 * One state shape covers all event_types. Fields that don't apply to the current
 * event_type are kept in state but ignored at submit time, so toggling event_type
 * mid-flow doesn't lose unrelated data.
 */

import type { EventType } from "@/lib/types";

export type LabeledTime = { label: string; time: string };
export type LabeledLocation = { label: string; address: string };
/** A row in the items editor. `id` and `hasSignups` are populated on the edit
 *  page when loading existing items; create flow leaves both undefined. When
 *  `hasSignups` is true, the row's remove button is disabled — you can't drop
 *  an item people have already claimed. */
export type ItemDraft = {
  label: string;
  itemLimit: number | null;
  /** Optional grouping header (e.g. "Women's Side"). Empty/undefined = ungrouped. */
  section?: string;
  id?: string;
  hasSignups?: boolean;
};

/** A single picked-date entry in spots "specific dates" mode. Each date carries
 *  its own start/end time so an organizer can run e.g.
 *    Apr 26  5:00 PM – 6:00 PM
 *    Apr 28  6:00 PM – 7:00 PM
 *  with different windows per date, edited individually. */
export type PickedDate = { date: string; start: string; end: string };

/** spots: pick dates by range (with weekday filter) or by individual calendar picks. */
export type SpotsDateMode = "range" | "specific";

/** A named, section-grouped slot offered on every picked spots date (e.g. a
 *  class). `capacity` null = unlimited. When `spotsSlots` is non-empty the
 *  generator emits one session per (date × slot) instead of time-only slots. */
export type SlotDraft = {
  label: string;
  section?: string;
  capacity: number | null;
  id?: string;
  hasSignups?: boolean;
};

export interface CreateFormState {
  // ── Core ──────────────────────────────────────────────────────────────────
  eventType: EventType;
  name: string;
  description: string;

  // ── Single date / time (used by rsvp, items) ─────────────────────────────
  date: string;            // ISO "YYYY-MM-DD" or ""
  multiDay: boolean;
  endDate: string;         // ISO when multiDay
  hasTime: boolean;
  approximateTime: boolean; // free-text "around 9am" mode
  startTime: string;
  endTime: string;
  /** Extra labeled times like "Meet at church 7:30" — applies to any event_type. */
  extraTimes: LabeledTime[];

  // ── Spots-only time / scheduling ─────────────────────────────────────────
  spotsDateMode: SpotsDateMode;
  spotsRangeStart: string;      // ISO
  spotsRangeEnd: string;        // ISO
  spotsPickedDates: PickedDate[];  // each entry has its own start/end time
  spotsBlockedDates: string[];  // ISO[]
  spotsWeekdays: number[];      // 0-6
  spotsStartTime: string;       // "HH:MM"
  spotsEndTime: string;         // "HH:MM"
  /** Auto-split the time window into fixed-duration slots (tithing-style). */
  spotsAutoSplit: boolean;
  spotsSlotDuration: number;    // minutes
  /** Default capacity applied to every generated session (per-session override
   *  lives in spotsCustomizePerSession future-state). */
  spotsCapacity: number;
  spotsCustomizePerSession: boolean;
  /** Optional named, section-grouped slots offered on every picked date. When
   *  non-empty, each date holds these slots (e.g. classes) instead of a single
   *  time-only slot. Only used in "specific" date mode. */
  spotsSlots: SlotDraft[];
  /** rsvp + multi-day: create exactly 1 session for the whole range. */
  singleSessionForEntireEvent: boolean;

  // ── Location ─────────────────────────────────────────────────────────────
  location: string;
  extraLocations: LabeledLocation[];

  // ── Capacity ─────────────────────────────────────────────────────────────
  /** rsvp only — spots capacity lives in spotsCapacity, items in per-row item_limit */
  hasCapacity: boolean;
  capacity: number;
  showCapacityPublicly: boolean;

  // ── Items ────────────────────────────────────────────────────────────────
  items: ItemDraft[];
  /** items: extra dates the event spans (e.g. 3 Thursdays), ISO "YYYY-MM-DD",
   *  sorted. Display-only — one claim covers all of them. The shared start/end
   *  time (startTime/endTime) applies to the whole set. Empty = use the single
   *  `date` field as before. */
  itemEventDates: string[];

  // ── Attendee fields ──────────────────────────────────────────────────────
  allowGuests: boolean;
  showSignupsPublicly: boolean;

  // ── Notifications ────────────────────────────────────────────────────────
  organizerDigestEnabled: boolean;
  organizerInstantNotifyEnabled: boolean;
  /** Optional assigned leader — gets an email with an .ics attachment on every
   *  signup when leaderEmail is set. */
  leaderName: string;
  leaderEmail: string;

  // ── Misc ─────────────────────────────────────────────────────────────────
  eventTimezone: string;

  // ── UI disclosure hints (set by presets, toggled by user) ────────────────
  /** When true, the corresponding inline expander is open in the form. */
  expanded: {
    extraTimes: boolean;
    extraLocations: boolean;
    advanced: boolean;
  };

  /** Per-type "user has edited something" flags. Set when the user touches a
   *  field belonging to that type's schedule/items; cleared when a preset is
   *  (re)applied. Used to suppress the destructive-switch confirm when nothing
   *  has been customized. */
  dirty: {
    spotsSchedule: boolean;
    itemsList: boolean;
  };
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEZONE = "America/Phoenix";

export const INITIAL_FORM_STATE: CreateFormState = {
  eventType: "rsvp",
  name: "",
  description: "",

  date: "",
  multiDay: false,
  endDate: "",
  hasTime: false,
  approximateTime: false,
  startTime: "",
  endTime: "",
  extraTimes: [],

  spotsDateMode: "range",
  spotsRangeStart: "",
  spotsRangeEnd: "",
  spotsPickedDates: [],
  spotsBlockedDates: [],
  spotsWeekdays: [],
  spotsStartTime: "",
  spotsEndTime: "",
  spotsAutoSplit: false,
  spotsSlotDuration: 15,
  spotsCapacity: 1,
  spotsCustomizePerSession: false,
  spotsSlots: [],
  singleSessionForEntireEvent: false,

  location: "",
  extraLocations: [],

  hasCapacity: false,
  capacity: 0,
  showCapacityPublicly: true,

  items: [],
  itemEventDates: [],

  // allow_guests follows event_type default at submit time if user hasn't touched it.
  // We start with the rsvp-friendly default; presets override.
  allowGuests: true,
  showSignupsPublicly: false,

  organizerDigestEnabled: true,
  organizerInstantNotifyEnabled: true,
  leaderName: "",
  leaderEmail: "",

  eventTimezone: DEFAULT_TIMEZONE,

  expanded: {
    extraTimes: false,
    extraLocations: false,
    advanced: false,
  },

  dirty: {
    spotsSchedule: false,
    itemsList: false,
  },
};

/** Field names that, when changed, mark the spots schedule as user-edited. */
export const SPOTS_SCHEDULE_FIELDS: ReadonlyArray<keyof CreateFormState> = [
  "spotsDateMode",
  "spotsRangeStart",
  "spotsRangeEnd",
  "spotsPickedDates",
  "spotsBlockedDates",
  "spotsWeekdays",
  "spotsStartTime",
  "spotsEndTime",
  "spotsAutoSplit",
  "spotsSlotDuration",
  "spotsCapacity",
  "spotsSlots",
];

/** Field names that, when changed, mark the items list as user-edited. */
export const ITEMS_LIST_FIELDS: ReadonlyArray<keyof CreateFormState> = ["items"];

// ── Type-switch destructive detection ───────────────────────────────────────

/**
 * Returns the list of human-readable data buckets that switching from
 * `from` → `to` would discard. Empty array means the switch is non-destructive.
 *
 * "Discard" means: data the new event_type cannot store. We still keep it in
 * client state in case the user switches back.
 */
export function discardedFieldsOnSwitch(
  state: CreateFormState,
  to: EventType
): string[] {
  const from = state.eventType;
  if (from === to) return [];
  const discarded: string[] = [];

  // Only warn when the user has actually customized something — preset
  // defaults alone shouldn't trigger a confirm dialog.
  if (from === "spots" && to !== "spots" && state.dirty.spotsSchedule) {
    discarded.push("the session schedule you set up");
  }
  if (from === "items" && to !== "items" && state.dirty.itemsList) {
    const n = state.items.length;
    discarded.push(`the ${n} item${n === 1 ? "" : "s"} you added`);
  }

  return discarded;
}

// ── Validation for submit ──────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateForSubmit(state: CreateFormState): ValidationResult {
  const errors: string[] = [];

  if (!state.name.trim()) errors.push("Event name is required");

  if (state.eventType === "spots") {
    if (state.spotsDateMode === "range") {
      if (!state.spotsRangeStart || !state.spotsRangeEnd) {
        errors.push("Pick a date range for the sessions");
      }
      if (!state.spotsStartTime) errors.push("Set a start time for the sessions");
    } else {
      if (state.spotsPickedDates.length === 0) {
        errors.push("Pick at least one date for the sessions");
      } else if (state.spotsPickedDates.some((p) => !p.start)) {
        errors.push("Set a start time for every picked date");
      }
    }
    if (state.spotsSlots.length > 0) {
      // Class-slot mode: capacity comes from each slot, not the global field.
      if (state.spotsDateMode !== "specific") {
        errors.push("Pick specific dates to offer classes/slots on each date");
      }
      if (state.spotsSlots.some((s) => !s.label.trim())) {
        errors.push("Every class/slot needs a name");
      }
    } else if (state.spotsCapacity <= 0) {
      errors.push("Set a capacity per session");
    }
  }

  if (state.eventType === "items") {
    if (state.items.length === 0) errors.push("Add at least one item");
    if (state.items.some((i) => !i.label.trim())) errors.push("Every item needs a label");
  }

  return { ok: errors.length === 0, errors };
}
