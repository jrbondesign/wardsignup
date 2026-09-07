"use client";

/**
 * Shared editor for a list of claimable "slots" — each slot is a label, an
 * optional section header, and an optional numeric limit/capacity.
 *
 * This is the composable building block behind both:
 *   - "Bring or Do" items (limit = how many can claim the item)
 *   - per-date class slots on Scheduled Sessions (limit = seats per class)
 *
 * Callers map their own field names onto SlotRow.limit and customize the copy
 * via props, so the same UI serves every "sectioned slots" context.
 */

export type SlotRow = {
  label: string;
  section?: string;
  /** null = unlimited. */
  limit: number | null;
  id?: string;
  hasSignups?: boolean;
};

const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2";
const sublabelCls = "font-normal text-[#5A8399]";

interface Props {
  rows: SlotRow[];
  onChange: (rows: SlotRow[]) => void;
  /** Field heading, e.g. 'Items / tasks people can claim' or 'Classes / slots people can claim'. */
  heading: string;
  /** Parenthetical hint after the heading. */
  headingHint?: string;
  /** Whether the per-row Section input is shown. */
  sectionEnabled?: boolean;
  /** Placeholder text for the label input. */
  labelPlaceholders?: string[];
  /** Placeholder for the section input. */
  sectionPlaceholder?: string;
  /** Copy for the "set a limit" toggle, e.g. 'Set a limit' or 'Set capacity'. */
  setLimitLabel?: string;
  /** Copy for the add button. */
  addLabel?: string;
  /** Unique id for the shared <datalist> of sections (avoid collisions across editors). */
  datalistId?: string;
  removeDisabledTitle?: string;
}

const DEFAULT_HINTS = ["Rolls & butter", "Green salad", "Setup crew", "Dessert", "Drinks"];

export default function SlotEditor({
  rows,
  onChange,
  heading,
  headingHint = "(at least one)",
  sectionEnabled = true,
  labelPlaceholders = DEFAULT_HINTS,
  sectionPlaceholder = "Section (optional) — e.g. Women's Side",
  setLimitLabel = "Set a limit",
  addLabel = "Add another item",
  datalistId = "slot-section-options",
  removeDisabledTitle = "Can't remove — people have already signed up",
}: Props) {
  const updateRow = (idx: number, patch: Partial<SlotRow>) =>
    onChange(rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  const lastSection =
    [...rows].reverse().find((it) => (it.section ?? "").trim())?.section?.trim() || "";
  const addRow = () =>
    onChange([...rows, { label: "", limit: null, section: sectionEnabled ? lastSection : undefined }]);

  const sections = Array.from(
    new Set(rows.map((it) => (it.section ?? "").trim()).filter(Boolean))
  );

  return (
    <section>
      <label className={labelCls}>
        {heading} {headingHint && <span className={sublabelCls}>{headingHint}</span>}
      </label>

      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-[rgba(14,150,176,0.25)] bg-[#F4FAFB] px-4 py-3 text-[13px] text-[#5A8399]">
            None yet — add one below.
          </div>
        )}

        {rows.map((item, i) => {
          const unlimited = item.limit === null;
          return (
            <div key={i} className="rounded-xl border border-[rgba(14,150,176,0.18)] bg-[#FAFDFE] p-3">
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateRow(i, { label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && i === rows.length - 1) {
                      e.preventDefault();
                      addRow();
                    }
                  }}
                  placeholder={`e.g., ${labelPlaceholders[i % labelPlaceholders.length]}`}
                  className="w-full text-sm text-[#0D2B35] px-[14px] py-[11px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={item.hasSignups}
                  aria-label="Remove"
                  title={item.hasSignups ? removeDisabledTitle : "Remove"}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[#5A8399] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  ×
                </button>
              </div>

              {sectionEnabled && (
                <input
                  type="text"
                  value={item.section ?? ""}
                  onChange={(e) => updateRow(i, { section: e.target.value })}
                  list={datalistId}
                  placeholder={sectionPlaceholder}
                  aria-label="Section"
                  className="mt-2 w-full text-[13px] text-[#0D2B35] px-[12px] py-[9px] border-[1.5px] border-[rgba(14,150,176,0.18)] rounded-lg bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-60"
                />
              )}

              <div role="radiogroup" aria-label="Limit" className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={unlimited}
                  onClick={() => updateRow(i, { limit: null })}
                  className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    unlimited
                      ? "bg-[#0E96B0] text-white border-[#0E96B0]"
                      : "bg-white text-[#2E5566] border-[rgba(14,150,176,0.28)] hover:border-[#0E96B0]"
                  }`}
                >
                  ∞ Unlimited
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!unlimited}
                  onClick={() => updateRow(i, { limit: item.limit ?? 1 })}
                  className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                    !unlimited
                      ? "bg-[#0E96B0] text-white border-[#0E96B0]"
                      : "bg-white text-[#2E5566] border-[rgba(14,150,176,0.28)] hover:border-[#0E96B0]"
                  }`}
                >
                  {setLimitLabel}
                </button>
                {!unlimited && (
                  <input
                    type="number"
                    min={1}
                    value={item.limit ?? 1}
                    onChange={(e) => {
                      const n = e.target.value === "" ? 1 : Math.max(1, Number(e.target.value));
                      updateRow(i, { limit: n });
                    }}
                    aria-label="Limit"
                    className="w-20 text-sm text-[#0D2B35] px-3 py-1.5 border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-lg bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] text-center"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sectionEnabled && sections.length > 0 && (
        <datalist id={datalistId}>
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-sm font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors mt-3"
      >
        <span className="w-6 h-6 rounded-md bg-[#E6F7FB] flex items-center justify-center text-[#0E96B0]">+</span>
        {addLabel}
      </button>
    </section>
  );
}
