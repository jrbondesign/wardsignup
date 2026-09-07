"use client";

import DateRangePicker from "@/components/DateRangePicker";

/**
 * Multi-date picker for items events that span several dates (e.g. 3 Thursdays).
 * Display-only: the dates are shown together on the public page and one claim
 * covers all of them. A single shared start/end time (edited elsewhere) applies
 * to the whole set, so unlike the spots picker there are no per-date times here.
 *
 * Values are ISO "YYYY-MM-DD" strings, kept sorted ascending.
 */

const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2";
const sublabelCls = "font-normal text-[#5A8399]";

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  dates: string[];
  onChange: (dates: string[]) => void;
}

export default function EventDatesPicker({ dates, onChange }: Props) {
  const toggle = (d: Date | null) => {
    if (!d) return;
    const iso = dateToIso(d);
    const next = dates.includes(iso)
      ? dates.filter((x) => x !== iso)
      : [...dates, iso].sort((a, b) => a.localeCompare(b));
    onChange(next);
  };

  const remove = (iso: string) => onChange(dates.filter((x) => x !== iso));

  const fmt = (iso: string) =>
    isoToDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <label className={labelCls}>
        Dates <span className={sublabelCls}>(pick each date this repeats — e.g. 3 Thursdays)</span>
      </label>
      <p className="text-[12px] text-[#5A8399] mb-2">
        One sign-up covers every date. The time below applies to all of them.
      </p>
      <div className="bg-[#F4FAFB] border border-[rgba(14,150,176,0.18)] rounded-xl p-3">
        <DateRangePicker
          singleDate
          rangeStart={null}
          rangeEnd={null}
          selectedDates={dates.map(isoToDate)}
          onChange={(s) => toggle(s)}
        />
      </div>
      {dates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-2">
          {dates.map((iso) => (
            <li key={iso}>
              <button
                type="button"
                onClick={() => remove(iso)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-full bg-white border-[1.5px] border-[rgba(14,150,176,0.20)] text-[#2E5566] hover:border-red-300 hover:text-red-600 transition-colors"
                aria-label={`Remove ${fmt(iso)}`}
              >
                {fmt(iso)} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
