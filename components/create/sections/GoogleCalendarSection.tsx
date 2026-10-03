"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import EventGoogleCalendarControls from "@/components/EventGoogleCalendarControls";
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
  organizationId?: string | null;
  eventId?: string;
}

export default function GoogleCalendarSection({ state, set, organizationId, eventId }: Props) {
  const show =
    isGcalSyncUIEnabled(organizationId ?? undefined) &&
    (state.eventType === "spots" || state.eventType === "rsvp");

  if (!show) return null;

  const isOpen = state.expanded.googleCalendar ?? false;
  const toggle = () =>
    set({
      expanded: {
        ...state.expanded,
        googleCalendar: !isOpen,
      },
    });

  return (
    <section className="rounded-2xl border-[1.5px] border-[rgba(14,150,176,0.18)] bg-[#F8FCFD] p-4 sm:p-5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="flex items-center gap-3 w-full text-left"
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#E6F7FB] text-[#0E96B0] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[#0D2B35]">Google Calendar</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A8399] bg-white border border-[rgba(14,150,176,0.25)] rounded-full px-2 py-0.5">
              Optional
            </span>
          </span>
          <span className="block text-[12px] text-[#5A8399] leading-snug mt-0.5">
            Add this event's filled time slots to a Google Calendar.
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 w-4 h-4 text-[#5A8399] transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-4">
          <EventGoogleCalendarControls
            organizationId={organizationId}
            eventType={state.eventType}
            eventId={eventId}
            value={{
              enabled: state.calendarSyncEnabled,
              calendarId: state.calendarId,
              calendarName: state.calendarName,
              inviteLeader: state.inviteLeader,
            }}
            onChange={(patch) => {
              const next: Partial<CreateFormState> = {};
              if ("enabled" in patch) next.calendarSyncEnabled = patch.enabled;
              if ("calendarId" in patch) next.calendarId = patch.calendarId;
              if ("calendarName" in patch) next.calendarName = patch.calendarName;
              if ("inviteLeader" in patch) next.inviteLeader = patch.inviteLeader;
              if (Object.keys(next).length > 0) set(next);
            }}
          />
        </div>
      )}
    </section>
  );
}
