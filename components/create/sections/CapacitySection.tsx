"use client";

import type { CreateFormState } from "@/lib/create-form-state";

const inputCls =
  "w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70";
const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2";
const sublabelCls = "font-normal text-[#5A8399]";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function CapacitySection({ state, set }: Props) {
  const isRsvp = state.eventType === "rsvp";
  const isSpots = state.eventType === "spots";
  if (!isRsvp && !isSpots) return null; // items uses per-item limits

  const labelText = isRsvp ? "Limit how many can sign up" : "Limit per session";
  const fieldLabel = isRsvp ? "Max attendees" : "People per session";

  return (
    <section className="space-y-3">
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isRsvp ? state.hasCapacity : true}
          onChange={(e) => {
            if (isRsvp) set({ hasCapacity: e.target.checked });
            // spots always has a capacity (sessions table requires > 0)
          }}
          disabled={isSpots}
          className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
        />
        <span className="text-[13px] font-medium text-[#2E5566]">
          {labelText}
        </span>
      </label>

      {(isSpots || state.hasCapacity) && (
        <div className="space-y-2 pl-6">
          <div>
            <label className={labelCls}>{fieldLabel}</label>
            <input
              type="number"
              min={1}
              value={isRsvp ? state.capacity || "" : state.spotsCapacity || ""}
              onChange={(e) => {
                const n = e.target.value === "" ? 0 : Math.max(1, Number(e.target.value));
                if (isRsvp) set({ capacity: n });
                else set({ spotsCapacity: n });
              }}
              placeholder={isRsvp ? "e.g. 40" : "e.g. 1"}
              className={`${inputCls} max-w-[180px]`}
            />
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.showCapacityPublicly}
              onChange={(e) => set({ showCapacityPublicly: e.target.checked })}
              className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
            />
            <span className="text-[12px] text-[#5A8399]">
              Show how many spots remain on the public signup page
              <span className={` ${sublabelCls} ml-1`}>(off = signups can&apos;t see fullness)</span>
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
