"use client";

import type { CreateFormState } from "@/lib/create-form-state";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function AttendeeFieldsSection({ state, set }: Props) {
  // Items signups don't have a guest concept (people claim things, they don't bring +1s).
  if (state.eventType === "items") return null;

  const helpText =
    state.eventType === "rsvp"
      ? "Each person can register their family / +1s by name. Names count toward capacity."
      : "Each person can add additional names to their slot. Names count toward capacity.";

  return (
    <section>
      <label className="inline-flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={state.allowGuests}
          onChange={(e) => set({ allowGuests: e.target.checked })}
          className="mt-0.5 w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium text-[#2E5566]">Allow guests</span>
          <span className="text-[12px] text-[#5A8399]">{helpText}</span>
        </span>
      </label>
    </section>
  );
}
