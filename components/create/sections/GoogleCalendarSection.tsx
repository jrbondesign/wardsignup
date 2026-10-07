"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import EventGoogleCalendarControls from "@/components/EventGoogleCalendarControls";
import OptionalDisclosureCard from "@/components/create/sections/OptionalDisclosureCard";
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";
import { isGoogleCalendarActive } from "@/lib/optional-event-settings";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
  organizationId?: string | null;
  eventId?: string;
  showUpdateNow?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  onSyncResult?: (result: { lastSyncedAt?: string | null; lastError?: string | null }) => void;
}

export default function GoogleCalendarSection({
  state,
  set,
  organizationId,
  eventId,
  showUpdateNow,
  lastSyncedAt,
  lastError,
  onSyncResult,
}: Props) {
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
    <OptionalDisclosureCard
      title="Google Calendar"
      description="Add this event’s filled time slots to a Google Calendar."
      open={isOpen}
      onToggle={toggle}
      active={isGoogleCalendarActive(state)}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      }
    >
      <EventGoogleCalendarControls
        organizationId={organizationId}
        eventType={state.eventType}
        eventId={eventId}
        showUpdateNow={showUpdateNow ?? Boolean(eventId)}
        lastSyncedAt={lastSyncedAt}
        lastError={lastError}
        onSyncResult={onSyncResult}
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
    </OptionalDisclosureCard>
  );
}
