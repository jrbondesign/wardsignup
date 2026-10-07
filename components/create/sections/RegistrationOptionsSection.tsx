"use client";

import type { CreateFormState } from "@/lib/create-form-state";
import { isRegistrationActive } from "@/lib/optional-event-settings";
import OptionalDisclosureCard, { SettingsToggle } from "@/components/create/sections/OptionalDisclosureCard";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function RegistrationOptionsSection({ state, set }: Props) {
  if (state.eventType === "items") return null;

  const isOpen = state.expanded.registration ?? false;
  const toggle = () =>
    set({
      expanded: {
        ...state.expanded,
        registration: !isOpen,
      },
    });

  const helpText =
    state.eventType === "rsvp"
      ? "Each person can register their family / +1s by name. Names count toward capacity."
      : "Each person can add additional names to their slot. Names count toward capacity.";

  return (
    <OptionalDisclosureCard
      title="Guests & spots remaining"
      description="Let people add extra names, and show how many spots are left."
      open={isOpen}
      onToggle={toggle}
      active={isRegistrationActive(state)}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      }
    >
      <div className="space-y-3">
        <SettingsToggle
          checked={state.allowGuests}
          onChange={(v) => set({ allowGuests: v })}
          label="Allow guests"
          help={helpText}
        />
        <SettingsToggle
          checked={state.showCapacityPublicly}
          onChange={(v) => set({ showCapacityPublicly: v })}
          label="Show spots remaining"
          help="Visible on the public signup page."
        />
      </div>
    </OptionalDisclosureCard>
  );
}
