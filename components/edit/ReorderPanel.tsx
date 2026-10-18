"use client";

export interface ReorderRow {
  /** Stable key (the slot's flat index works, it does not change on reorder). */
  key: string | number;
  /** Class name, or the time when there is no class name. */
  name: string;
  /** Secondary line, e.g. the time when `name` is a class name. */
  detail?: string;
  /** Section label; a header is drawn when it changes between rows. */
  section?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface ReorderPanelProps {
  /** Day label, e.g. "Thursday, Oct 8". */
  dayLabel: string;
  rows: ReorderRow[];
  onMove: (position: number, direction: "up" | "down") => void;
  onDone: () => void;
}

function Arrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-5 h-5 ${direction === "down" ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

/** Reorder mode for one day: each slot is a compact row with up and down
 *  buttons. Moves are staged until Save, like every other edit. */
export default function ReorderPanel({ dayLabel, rows, onMove, onDone }: ReorderPanelProps) {
  const title = `Reorder slots on ${dayLabel}`;
  return (
    <section aria-label={title} className="rounded-xl border-[1.5px] border-[#0E96B0]/40 bg-[#F4FAFB] p-3 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-[17px] leading-tight text-[#0D2B35] min-w-0">{title}</h3>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] px-5 text-sm font-semibold text-white bg-[#0E96B0] hover:bg-[#08647E] rounded-xl transition-colors flex-shrink-0"
        >
          Done
        </button>
      </div>
      <p className="text-[12px] text-[#5A8399] mt-1">Move slots up or down. Changes apply when you save.</p>
      <ol className="mt-3 space-y-2">
        {rows.map((row, pos) => {
          const prevSection = pos > 0 ? (rows[pos - 1].section ?? "").trim() : "";
          const section = (row.section ?? "").trim();
          const showSection = section !== "" && section !== prevSection;
          return (
            <li key={row.key}>
              {showSection && (
                <div className="px-0.5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#5A8399]">
                  {section}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(14,150,176,0.16)] bg-white pl-4 pr-2 py-1">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-[#0D2B35] leading-tight truncate">{row.name}</div>
                  {row.detail && <div className="text-xs text-[#5A8399] mt-0.5 truncate">{row.detail}</div>}
                </div>
                <button
                  type="button"
                  aria-label={`Move ${row.name} up`}
                  disabled={!row.canMoveUp}
                  onClick={() => onMove(pos, "up")}
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-[#0E96B0] hover:bg-[#E6F7FB] transition-colors disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  <Arrow direction="up" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${row.name} down`}
                  disabled={!row.canMoveDown}
                  onClick={() => onMove(pos, "down")}
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-[#0E96B0] hover:bg-[#E6F7FB] transition-colors disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  <Arrow direction="down" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
