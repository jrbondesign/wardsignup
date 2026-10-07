"use client";

import { COMMON_EVENT_TIMEZONES } from "@/lib/common-timezones";
import type { CreateFormState } from "@/lib/create-form-state";
import { isEventSettingsActive } from "@/lib/optional-event-settings";
import OptionalDisclosureCard from "@/components/create/sections/OptionalDisclosureCard";

const inputCls =
  "w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]";
const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function EventSettingsSection({ state, set }: Props) {
  const open = state.expanded.settings ?? false;
  const toggle = () => set({ expanded: { ...state.expanded, settings: !open } });

  return (
    <OptionalDisclosureCard
      title="Leader & timezone"
      description="Event leader, timezone."
      open={open}
      onToggle={toggle}
      active={isEventSettingsActive(state)}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      }
    >
      <div className="space-y-4">
        <div>
          <span className={labelCls}>Event leader (optional)</span>
          <p className="text-[12px] text-[#5A8399] mb-2">
            Assign a leader and they&apos;ll get an email with a calendar file each time someone signs up.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={state.leaderName}
              onChange={(e) => set({ leaderName: e.target.value })}
              placeholder="Leader name"
              className={inputCls}
              aria-label="Leader name"
            />
            <input
              type="email"
              value={state.leaderEmail}
              onChange={(e) => set({ leaderEmail: e.target.value })}
              placeholder="Leader email"
              className={inputCls}
              aria-label="Leader email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="event-tz" className={labelCls}>
            Event timezone
          </label>
          <select
            id="event-tz"
            value={state.eventTimezone}
            onChange={(e) => set({ eventTimezone: e.target.value })}
            className={inputCls}
          >
            {COMMON_EVENT_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </OptionalDisclosureCard>
  );
}
