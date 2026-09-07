"use client";

import { useReducer, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/auth";
import EventTypePicker from "@/components/create/EventTypePicker";
import TimeSection from "@/components/create/sections/TimeSection";
import LocationSection from "@/components/create/sections/LocationSection";
import CapacitySection from "@/components/create/sections/CapacitySection";
import AttendeeFieldsSection from "@/components/create/sections/AttendeeFieldsSection";
import ItemsSection from "@/components/create/sections/ItemsSection";
import AdvancedSection from "@/components/create/sections/AdvancedSection";
import ComponentCard from "@/components/create/sections/ComponentCard";
import {
  INITIAL_FORM_STATE,
  SPOTS_SCHEDULE_FIELDS,
  ITEMS_LIST_FIELDS,
  discardedFieldsOnSwitch,
  type CreateFormState,
} from "@/lib/create-form-state";
import { generateSpotsSessions } from "@/lib/spots-session-generator";
import { applyPreset, getAlternateRsvpDescription } from "@/lib/event-presets";
import { getEventTemplate, type TemplateKey } from "@/lib/event-template-data";
import { aiResultToFormPatch } from "@/lib/ai-result-to-form";
import type { AiEventResult } from "@/lib/ai-event-extraction";
import type { EventType } from "@/lib/types";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SessionsPreview({ state }: { state: CreateFormState }) {
  const sessions = generateSpotsSessions(state);
  const count = sessions.length;
  if (count === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgba(14,150,176,0.25)] bg-[#F4FAFB] px-4 py-3 text-[13px] text-[#5A8399]">
        Set a date {state.spotsDateMode === "range" ? "range and time window" : "and time"} above to see how many sessions will be created.
      </div>
    );
  }
  return (
    <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-4 py-3 text-sm text-[#2E5566] leading-relaxed">
      <strong className="text-[#0D2B35] font-semibold">Ready to go: </strong>
      {count} signup slot{count === 1 ? "" : "s"} will be created.
    </div>
  );
}

// ── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: "set"; patch: Partial<CreateFormState> }
  | { type: "applyPreset"; key: TemplateKey }
  | { type: "applyAi"; result: AiEventResult }
  | { type: "switchEventType"; next: EventType }
  | { type: "switchDualModeToRsvp"; previousTemplate: TemplateKey | null };

function reducer(state: CreateFormState, action: Action): CreateFormState {
  switch (action.type) {
    case "set": {
      const patchKeys = Object.keys(action.patch) as Array<keyof CreateFormState>;
      const touchesSpots = patchKeys.some((k) => SPOTS_SCHEDULE_FIELDS.includes(k));
      const touchesItems = patchKeys.some((k) => ITEMS_LIST_FIELDS.includes(k));
      return {
        ...state,
        ...action.patch,
        dirty: {
          spotsSchedule: state.dirty.spotsSchedule || touchesSpots,
          itemsList: state.dirty.itemsList || touchesItems,
        },
      };
    }

    case "applyPreset":
      // Preset (re)application is the canonical "clean" state — clear flags.
      return { ...applyPreset(state, action.key), dirty: { spotsSchedule: false, itemsList: false } };

    case "applyAi": {
      // AI prefill is treated like a preset: it produces a clean baseline that
      // the user can edit afterward. Schedule/items dirty flags reset so the
      // type-switch confirm doesn't fire just because AI populated fields.
      const patch = aiResultToFormPatch(action.result);
      return { ...state, ...patch, dirty: { spotsSchedule: false, itemsList: false } };
    }

    case "switchEventType": {
      // Caller is responsible for confirming destructive switches before dispatching.
      const next: CreateFormState = { ...state, eventType: action.next };
      // Keep allow_guests sensible by default per type, but only if the user
      // hasn't intentionally moved away from the type-default for the prior type.
      if (action.next === "rsvp" && state.eventType !== "rsvp") {
        // RSVP feels weird without guest toggle — default it on if the user hadn't.
        // (Soft default; user can flip in Advanced.)
      }
      return next;
    }

    case "switchDualModeToRsvp": {
      // Dual-mode templates (potluck/service-project/moving-help) have an alt
      // description for RSVP mode. Apply it if the description is still the
      // template's items-mode default.
      if (!action.previousTemplate) return { ...state, eventType: "rsvp" };
      const tpl = getEventTemplate(action.previousTemplate);
      const alt = getAlternateRsvpDescription(action.previousTemplate);
      const stillDefault = tpl ? state.description === tpl.defaultDescription : false;
      return {
        ...state,
        eventType: "rsvp",
        description: stillDefault && alt ? alt : state.description,
      };
    }
  }
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  initialTemplateKey: TemplateKey | null;
  /** Optional AI-extracted result to apply as the initial form state. Used when
   *  the page-level AI input fires; the form re-mounts with this baseline. */
  initialAiResult?: AiEventResult | null;
  /** Reports whether the user has started filling the form, so the page can confirm
   *  before a template/AI pick remounts (and wipes) in-progress work. */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function UnifiedCreateForm({ initialTemplateKey, initialAiResult, onDirtyChange }: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    reducer,
    INITIAL_FORM_STATE,
    (init) => {
      // AI wins over template when both are present (the user just hit "Fill in
      // with AI" and that should beat a stale template URL param).
      if (initialAiResult) return { ...init, ...aiResultToFormPatch(initialAiResult) };
      if (initialTemplateKey) return applyPreset(init, initialTemplateKey);
      return init;
    }
  );
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey | null>(
    initialAiResult ? null : initialTemplateKey
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Auto-detect timezone on mount (matches existing flow).
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) dispatch({ type: "set", patch: { eventTimezone: tz } });
    } catch {
      /* keep default */
    }
  }, []);

  // Report dirtiness up so the page can guard a remount-on-template/AI pick.
  useEffect(() => {
    const dirty =
      state.name.trim() !== "" ||
      state.description.trim() !== "" ||
      state.dirty.spotsSchedule ||
      state.dirty.itemsList ||
      state.items.length > 0;
    onDirtyChange?.(dirty);
  }, [state.name, state.description, state.dirty.spotsSchedule, state.dirty.itemsList, state.items, onDirtyChange]);

  // ── Type switching with destructive-confirm ─────────────────────────────
  const handleTypeChange = (next: EventType) => {
    if (next === state.eventType) return;
    const discarded = discardedFieldsOnSwitch(state, next);
    if (discarded.length > 0) {
      const ok = window.confirm(
        `Switching event type will discard ${discarded.join(" and ")}.\n\nContinue?`
      );
      if (!ok) return;
    }
    // Special-case dual-mode items → rsvp: also swap description if untouched.
    if (state.eventType === "items" && next === "rsvp" && activeTemplate) {
      dispatch({ type: "switchDualModeToRsvp", previousTemplate: activeTemplate });
    } else {
      dispatch({ type: "switchEventType", next });
    }
  };

  // ── Submit (skeleton — rsvp only for now) ────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!state.name.trim()) {
      setError("Event name is required");
      return;
    }
    if (state.eventType === "rsvp") {
      if (!state.date) { setError("Pick a date for the event"); return; }
      if (state.hasTime && !state.startTime) {
        setError("Set a start time, or uncheck \"This event has a time\"");
        return;
      }
    }
    if (state.eventType === "items") {
      const cleanItems = state.items.filter((i) => i.label.trim());
      if (cleanItems.length === 0) {
        setError("Add at least one item with a label");
        return;
      }
    }
    let plannedSpotsSessions: ReturnType<typeof generateSpotsSessions> = [];
    if (state.eventType === "spots") {
      if (state.spotsDateMode === "range") {
        if (!state.spotsRangeStart || !state.spotsRangeEnd) {
          setError("Pick a date range for the sessions");
          return;
        }
        if (!state.spotsStartTime) {
          setError("Set a start time for the sessions");
          return;
        }
      } else {
        if (state.spotsPickedDates.length === 0) {
          setError("Pick at least one date for the sessions");
          return;
        }
        if (state.spotsPickedDates.some((p) => !p.start)) {
          setError("Set a start time for every picked date");
          return;
        }
      }
      plannedSpotsSessions = generateSpotsSessions(state);
      if (plannedSpotsSessions.length === 0) {
        setError("No sessions would be created — check the date range, weekdays, and time window.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        router.push("/login");
        return;
      }

      // POST /api/events
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: state.name.trim(),
          description: state.description.trim() || null,
          event_timezone: state.eventTimezone,
          event_type: state.eventType,
          allow_guests: state.allowGuests,
          show_capacity_publicly: state.showCapacityPublicly,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to create event");
      }
      const { event } = await res.json();

      // PATCH event-level extras (event_date / event_times / event_locations,
      // visibility flags, organizer notification prefs).
      const cleanExtraTimes = state.extraTimes
        .map((t) => ({ label: t.label.trim(), time: t.time.trim() }))
        .filter((t) => t.label && t.time);
      const cleanExtraLocations = state.extraLocations
        .map((l) => ({ label: l.label.trim(), address: l.address.trim() }))
        .filter((l) => l.label || l.address);

      // items can span several dates (display-only). The first date doubles as
      // event_date so single-date consumers (reminders, list views) keep working.
      const itemDates = state.eventType === "items" ? state.itemEventDates : [];
      const resolvedEventDate =
        state.eventType === "items" ? itemDates[0] ?? null : state.date || null;

      await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          event_date: resolvedEventDate,
          event_dates: itemDates,
          event_end_date: state.multiDay && state.endDate && state.endDate > state.date ? state.endDate : null,
          event_start_time: state.hasTime ? state.startTime || null : null,
          event_end_time: state.hasTime ? state.endTime || null : null,
          event_times: cleanExtraTimes,
          event_locations: cleanExtraLocations,
          show_signups_publicly: state.showSignupsPublicly,
          organizer_digest_enabled: state.organizerDigestEnabled,
          organizer_instant_notify_enabled: state.organizerInstantNotifyEnabled,
          leader_name: state.leaderName.trim() || null,
          leader_email: state.leaderEmail.trim() || null,
        }),
      });

      if (state.eventType === "rsvp") {
        // rsvp creates exactly 1 session anchored to the start date (multi-day range
        // is informational; a single signup slot covers the whole event).
        const dateStr = state.date || todayIso();
        const dow = new Date(`${dateStr}T00:00:00`).getDay();
        const sessionsRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            campaign_id: event.id,
            sessions: [
              {
                day_of_week: dow,
                time: state.hasTime && state.startTime ? state.startTime : "00:00",
                end_time: state.hasTime && state.endTime ? state.endTime : null,
                capacity: state.hasCapacity ? state.capacity : 999,
                location: state.location.trim() || null,
                notes: null,
                session_date: dateStr,
              },
            ],
          }),
        });
        if (!sessionsRes.ok) {
          router.push(`/admin/${event.id}?warn=session-failed`);
          return;
        }
      } else if (state.eventType === "spots") {
        // Generated sessions inherit the event-level location for v1; per-session
        // location overrides come from the edit page.
        const sessions = plannedSpotsSessions.map((s) => ({
          ...s,
          location: state.location.trim() || s.location,
        }));
        const sessionsRes = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ campaign_id: event.id, sessions }),
        });
        if (!sessionsRes.ok) {
          router.push(`/admin/${event.id}?warn=session-failed`);
          return;
        }
      } else {
        // items: POST the items list
        const cleanItems = state.items
          .map((it) => ({
            label: it.label.trim(),
            item_limit: it.itemLimit,
            section: (it.section ?? "").trim() || null,
          }))
          .filter((it) => it.label);
        const itemsRes = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ campaign_id: event.id, items: cleanItems }),
        });
        if (!itemsRes.ok) {
          router.push(`/admin/${event.id}?warn=items-failed`);
          return;
        }
      }

      router.push(`/admin/${event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-4">
      {/* Each component is its own card so it's obvious where one ends and the
           next begins. Required components first, then a clearly-labeled zone of
           optional add-ons. The response-model picker is always visible/editable. */}

      <ComponentCard
        title="How do people respond?"
        description="The core of your event — pick one. You can change it anytime."
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        }
      >
        <EventTypePicker value={state.eventType} onChange={handleTypeChange} />
      </ComponentCard>

      <ComponentCard
        title="Event details"
        description="Name your event and add an optional description."
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="event-name" className="block text-[13px] font-semibold text-[#2E5566] mb-1.5">
              Event name <span className="text-[#5A8399] font-normal">(required)</span>
            </label>
            <input
              id="event-name"
              type="text"
              value={state.name}
              onChange={(e) => dispatch({ type: "set", patch: { name: e.target.value } })}
              placeholder="e.g. Ward Potluck"
              className="w-full px-3.5 py-2.5 text-[14px] rounded-lg border-[1.5px] border-[rgba(14,150,176,0.20)] focus:border-[#0E96B0] focus:outline-none focus:ring-[3px] focus:ring-[rgba(14,150,176,0.10)]"
              required
            />
          </div>
          <div>
            <label htmlFor="event-desc" className="block text-[13px] font-semibold text-[#2E5566] mb-1.5">
              Description <span className="text-[#5A8399] font-normal">(optional)</span>
            </label>
            <textarea
              id="event-desc"
              value={state.description}
              onChange={(e) => dispatch({ type: "set", patch: { description: e.target.value } })}
              rows={4}
              placeholder="What's this event about?"
              className="w-full px-3.5 py-2.5 text-[14px] rounded-lg border-[1.5px] border-[rgba(14,150,176,0.20)] focus:border-[#0E96B0] focus:outline-none focus:ring-[3px] focus:ring-[rgba(14,150,176,0.10)] resize-y"
            />
          </div>
        </div>
      </ComponentCard>

      <ComponentCard
        title={state.eventType === "spots" ? "Schedule" : "Date & time"}
        description={
          state.eventType === "spots"
            ? "When sessions run and how slots are generated."
            : "When your event happens."
        }
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        }
      >
        <TimeSection state={state} set={(patch) => dispatch({ type: "set", patch })} />
      </ComponentCard>

      {(state.eventType === "rsvp" || state.eventType === "spots") && (
        <ComponentCard
          title="Capacity"
          description={state.eventType === "spots" ? "Cap how many can claim each session." : "Optionally cap total signups."}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        >
          <CapacitySection state={state} set={(patch) => dispatch({ type: "set", patch })} />
        </ComponentCard>
      )}

      {state.eventType === "items" && (
        <ComponentCard
          title="Items &amp; tasks"
          description="The list of things people can claim."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        >
          <ItemsSection state={state} set={(patch) => dispatch({ type: "set", patch })} />
        </ComponentCard>
      )}

      {state.eventType === "spots" && <SessionsPreview state={state} />}

      {/* Optional add-on zone — clearly separated so it reads as "add only what
           you need." Each is a tinted, Optional-flagged card. */}
      <div className="pt-3">
        <h2 className="text-[14px] font-bold text-[#0D2B35]">Add to your event</h2>
        <p className="text-[12px] text-[#5A8399] mt-0.5">
          Optional components — add only the ones you need.
        </p>
      </div>

      <ComponentCard
        optional
        title="Location"
        description="Where it happens. Add carpool or secondary spots too."
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
          </svg>
        }
      >
        <LocationSection state={state} set={(patch) => dispatch({ type: "set", patch })} />
      </ComponentCard>

      {(state.eventType === "rsvp" || state.eventType === "spots") && (
        <ComponentCard
          optional
          title="Guests"
          description="Let people add family or +1s to their signup."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          }
        >
          <AttendeeFieldsSection state={state} set={(patch) => dispatch({ type: "set", patch })} />
        </ComponentCard>
      )}

      <AdvancedSection state={state} set={(patch) => dispatch({ type: "set", patch })} />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {activeTemplate && (
          <button
            type="button"
            onClick={() => {
              setActiveTemplate(null);
              dispatch({ type: "set", patch: { name: "", description: "" } });
            }}
            className="text-[12px] text-[#5A8399] underline hover:text-[#0E96B0]"
          >
            Reset name &amp; description
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="ml-auto px-5 py-2.5 text-[14px] font-semibold text-white bg-[#0E96B0] hover:bg-[#0a7a8e] rounded-lg disabled:opacity-50 transition-colors"
        >
          {submitting ? "Creating…" : "Continue →"}
        </button>
      </div>
    </form>
  );
}
