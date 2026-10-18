"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import { isVisibilityActive } from "@/lib/optional-event-settings";
import OptionalDisclosureCard, { SettingsToggle } from "@/components/create/sections/OptionalDisclosureCard";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function VisibilitySection({ state, set }: Props) {
  const open = state.expanded.visibility ?? false;
  const toggle = () => set({ expanded: { ...state.expanded, visibility: !open } });

  return (
    <OptionalDisclosureCard
      title="Visibility & directory"
      description="Control who can see your event and signup list."
      open={open}
      onToggle={toggle}
      active={isVisibilityActive(state)}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      }
    >
      <div className="space-y-3">
        <SettingsToggle
          checked={state.showSignupsPublicly}
          onChange={(v) => set({ showSignupsPublicly: v })}
          label="Show the signup list publicly"
          help="Off (default): only the organizer sees who signed up. On: anyone with the event link can see."
        />
        <SettingsToggle
          checked={state.listOnDirectory}
          onChange={(v) => set({ listOnDirectory: v })}
          label="Show on public directory at wardsignup.com/w/[org-name]"
          help="Appears only while this event is still accepting signups and is not past."
        />
      </div>
    </OptionalDisclosureCard>
  );
}
