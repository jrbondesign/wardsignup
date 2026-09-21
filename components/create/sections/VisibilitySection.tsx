"use client";

import type { CreateFormState } from "@/lib/create-form-state";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function VisibilitySection({ state, set }: Props) {
  const open = state.expanded.visibility ?? false;
  const toggle = () => set({ expanded: { ...state.expanded, visibility: !open } });

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
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[#0D2B35]">Visibility & directory</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A8399] bg-white border border-[rgba(14,150,176,0.25)] rounded-full px-2 py-0.5">
              Optional
            </span>
          </span>
          <span className="block text-[12px] text-[#5A8399] leading-snug mt-0.5">
            Control who can see your event and signup list.
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
        <div className="mt-4 space-y-3">
          <Toggle
            checked={state.showSignupsPublicly}
            onChange={(v) => set({ showSignupsPublicly: v })}
            label="Show the signup list publicly"
            help="Off (default): only the organizer sees who signed up. On: anyone with the event link can see."
          />
          <Toggle
            checked={state.listOnDirectory}
            onChange={(v) => set({ listOnDirectory: v })}
            label="List on ward directory"
            help="When your ward directory is published, this event will appear there (only when accepting signups)."
          />
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
