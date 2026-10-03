"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import { isNotificationsActive } from "@/lib/optional-event-settings";
import OptionalDisclosureCard, { SettingsToggle } from "@/components/create/sections/OptionalDisclosureCard";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function NotificationsSection({ state, set }: Props) {
  const open = state.expanded.notifications ?? false;
  const toggle = () => set({ expanded: { ...state.expanded, notifications: !open } });

  return (
    <OptionalDisclosureCard
      title="Notifications"
      description="Get notified when someone signs up."
      open={open}
      onToggle={toggle}
      active={isNotificationsActive(state)}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      }
    >
      <div className="space-y-3">
        <SettingsToggle
          checked={state.organizerInstantNotifyEnabled}
          onChange={(v) => set({ organizerInstantNotifyEnabled: v })}
          label="Email me instantly when someone signs up"
        />
        <SettingsToggle
          checked={state.organizerDigestEnabled}
          onChange={(v) => set({ organizerDigestEnabled: v })}
          label="Send me a daily digest of new signups"
        />
      </div>
    </OptionalDisclosureCard>
  );
}
