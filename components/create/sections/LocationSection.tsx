"use client";

import type { CreateFormState, LabeledLocation } from "@/lib/create-form-state";

const inputCls =
  "w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70";
const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2";
const sublabelCls = "font-normal text-[#5A8399]";
const linkBtnCls =
  "inline-flex items-center gap-1 text-[12px] font-semibold text-[#0E96B0] hover:text-[#08647E] hover:border-[#0E96B0] hover:bg-white border-[1.5px] border-dashed border-[rgba(14,150,176,0.35)] rounded-full px-3 py-1.5 transition-colors";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function LocationSection({ state, set }: Props) {
  const expanded = state.expanded.extraLocations || state.extraLocations.length > 0;

  const updateRow = (idx: number, patch: Partial<LabeledLocation>) => {
    set({
      extraLocations: state.extraLocations.map((row, i) =>
        i === idx ? { ...row, ...patch } : row
      ),
    });
  };
  const removeRow = (idx: number) =>
    set({ extraLocations: state.extraLocations.filter((_, i) => i !== idx) });
  const addRow = () =>
    set({
      extraLocations: [...state.extraLocations, { label: "", address: "" }],
      expanded: { ...state.expanded, extraLocations: true },
    });

  return (
    <section className="space-y-3">
      <div>
        <label htmlFor="event-location" className={labelCls}>
          Location <span className={sublabelCls}>(optional)</span>
        </label>
        <input
          id="event-location"
          type="text"
          value={state.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="e.g. Cultural Hall, 123 Main St"
          className={inputCls}
        />
      </div>

      {expanded ? (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-[#2E5566]">Additional locations</div>
          {state.extraLocations.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
              <input
                type="text"
                value={row.label}
                onChange={(e) => updateRow(i, { label: e.target.value })}
                placeholder="Label (e.g. Carpool meet)"
                className={inputCls}
              />
              <input
                type="text"
                value={row.address}
                onChange={(e) => updateRow(i, { address: e.target.value })}
                placeholder="Address"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Remove"
                className="text-[#5A8399] hover:text-red-600 px-2"
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className={linkBtnCls}>
            + Add another
          </button>
        </div>
      ) : (
        <button type="button" onClick={addRow} className={linkBtnCls}>
          + Add another location (e.g. carpool meet point)
        </button>
      )}
    </section>
  );
}
