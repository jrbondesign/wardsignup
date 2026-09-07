"use client";

import { COMMON_EVENT_TIMEZONES } from "@/lib/common-timezones";
import type { CreateFormState } from "@/lib/create-form-state";

const inputCls =
  "w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]";
const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function AdvancedSection({ state, set }: Props) {
  const open = state.expanded.advanced;
  const toggle = () => set({ expanded: { ...state.expanded, advanced: !open } });

  return (
    <section className="rounded-2xl border-[1.5px] border-[rgba(14,150,176,0.18)] bg-[#F8FCFD] p-4 sm:p-5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-3 w-full text-left"
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#E6F7FB] text-[#0E96B0] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[#0D2B35]">Notifications &amp; visibility</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A8399] bg-white border border-[rgba(14,150,176,0.25)] rounded-full px-2 py-0.5">
              Optional
            </span>
          </span>
          <span className="block text-[12px] text-[#5A8399] leading-snug mt-0.5">
            Email alerts, public signup list, timezone.
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 w-4 h-4 text-[#5A8399] transition-transform ${open ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <Toggle
            checked={state.showSignupsPublicly}
            onChange={(v) => set({ showSignupsPublicly: v })}
            label="Show the signup list publicly"
            help="Off (default): only the organizer sees who signed up. On: anyone with the event link can see."
          />
          <Toggle
            checked={state.organizerInstantNotifyEnabled}
            onChange={(v) => set({ organizerInstantNotifyEnabled: v })}
            label="Email me instantly when someone signs up"
          />
          <Toggle
            checked={state.organizerDigestEnabled}
            onChange={(v) => set({ organizerDigestEnabled: v })}
            label="Send me a daily digest of new signups"
          />

          <div className="pt-1">
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
      )}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-[#2E5566]">{label}</span>
        {help && <span className="text-[12px] text-[#5A8399]">{help}</span>}
      </span>
    </label>
  );
}
