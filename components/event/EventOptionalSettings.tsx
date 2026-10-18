"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import VisibilitySection from "@/components/create/sections/VisibilitySection";
import NotificationsSection from "@/components/create/sections/NotificationsSection";
import GoogleCalendarSection from "@/components/create/sections/GoogleCalendarSection";
import EventSettingsSection from "@/components/create/sections/EventSettingsSection";
import RegistrationOptionsSection from "@/components/create/sections/RegistrationOptionsSection";

type Props = {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
  organizationId?: string | null;
  eventId?: string;
  includeRegistration?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  onSyncResult?: (result: { lastSyncedAt?: string | null; lastError?: string | null }) => void;
  reportAction?: { sending: boolean; onSend: () => void };
};

/**
 * Shared optional-settings stack for edit and manage so both surfaces match.
 */
export default function EventOptionalSettings({
  state,
  set,
  organizationId,
  eventId,
  includeRegistration = false,
  lastSyncedAt,
  lastError,
  onSyncResult,
  reportAction,
}: Props) {
  return (
    <div className="space-y-3">
      <VisibilitySection state={state} set={set} />
      <NotificationsSection state={state} set={set} />
      {reportAction && (
        <div className="flex justify-end -mt-1">
          <button
            type="button"
            disabled={reportAction.sending}
            onClick={reportAction.onSend}
            className="text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline"
          >
            {reportAction.sending ? "Sending…" : "Send organizer report now"}
          </button>
        </div>
      )}
      <GoogleCalendarSection
        state={state}
        set={set}
        organizationId={organizationId}
        eventId={eventId}
        lastSyncedAt={lastSyncedAt}
        lastError={lastError}
        onSyncResult={onSyncResult}
      />
      <EventSettingsSection state={state} set={set} />
      {includeRegistration && <RegistrationOptionsSection state={state} set={set} />}
    </div>
  );
}
