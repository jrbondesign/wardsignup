"use client";

import { useState } from "react";
import TimeInput from "@/components/TimeInput";
import DateRangePicker from "@/components/DateRangePicker";
import EventDatesPicker from "@/components/create/EventDatesPicker";
import SlotEditor, { type SlotRow } from "@/components/create/SlotEditor";
import type { CreateFormState, LabeledTime } from "@/lib/create-form-state";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inputCls =
  "w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] rounded-xl bg-white outline-none transition-all border-[1.5px] border-[rgba(14,150,176,0.22)] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70";
const labelCls = "block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2";
const sublabelCls = "font-normal text-[#5A8399]";
const linkBtnCls =
  "inline-flex items-center gap-1 text-[12px] font-semibold text-[#0E96B0] hover:text-[#08647E] hover:border-[#0E96B0] hover:bg-[#F4FAFB] border-[1.5px] border-dashed border-[rgba(14,150,176,0.35)] rounded-full px-3 py-1.5 transition-colors";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
}

export default function TimeSection({ state, set }: Props) {
  if (state.eventType === "rsvp") return <RsvpTime state={state} set={set} />;
  if (state.eventType === "items") return <ItemsTime state={state} set={set} />;
  return <SpotsTime state={state} set={set} />;
}

// ── rsvp ──────────────────────────────────────────────────────────────────

function RsvpTime({ state, set }: Props) {
  return (
    <section className="space-y-4">
<div>
        <label htmlFor="event-date" className={labelCls}>
          Date {!state.multiDay && <span className={sublabelCls}>(required)</span>}
          {state.multiDay && <span className={sublabelCls}>— start</span>}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            id="event-date"
            type="date"
            value={state.date}
            onChange={(e) => set({ date: e.target.value })}
            className={inputCls}
            required
          />
          {state.multiDay && (
            <input
              type="date"
              aria-label="End date"
              value={state.endDate}
              min={state.date || undefined}
              onChange={(e) => set({ endDate: e.target.value })}
              className={inputCls}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            set({ multiDay: !state.multiDay, endDate: !state.multiDay ? state.endDate : "" })
          }
          className={`${linkBtnCls} mt-2`}
        >
          {state.multiDay ? "← Make this a single day" : "Make this multi-day →"}
        </button>
      </div>

      <TimeFields state={state} set={set} />

      <ExtraTimes state={state} set={set} />
    </section>
  );
}

// ── items ─────────────────────────────────────────────────────────────────

function ItemsTime({ state, set }: Props) {
  const datesOn = state.itemEventDates.length > 0 || !!state.date;
  return (
    <section className="space-y-4">
<div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={datesOn}
            onChange={(e) => {
              if (e.target.checked) {
                set({ itemEventDates: [state.date || todayIso()], date: "" });
              } else {
                set({ itemEventDates: [], date: "" });
              }
            }}
            className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
          />
          <span className="text-[13px] font-medium text-[#2E5566]">
            This event has one or more dates
          </span>
        </label>
        {datesOn && (
          <div className="mt-2">
            <EventDatesPicker
              dates={
                state.itemEventDates.length > 0
                  ? state.itemEventDates
                  : state.date
                    ? [state.date]
                    : []
              }
              onChange={(dates) => set({ itemEventDates: dates, date: "" })}
            />
          </div>
        )}
      </div>

      <TimeFields state={state} set={set} />

      <ExtraTimes state={state} set={set} />
    </section>
  );
}

// ── spots ─────────────────────────────────────────────────────────────────

function SpotsTime({ state, set }: Props) {
  const toggleDay = (d: number) => {
    const next = state.spotsWeekdays.includes(d)
      ? state.spotsWeekdays.filter((x) => x !== d)
      : [...state.spotsWeekdays, d].sort();
    set({ spotsWeekdays: next });
  };

  const togglePickedDate = (d: Date | null) => {
    if (!d) return;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const ds = `${y}-${m}-${dd}`;
    const existing = state.spotsPickedDates.find((p) => p.date === ds);
    if (existing) {
      set({ spotsPickedDates: state.spotsPickedDates.filter((p) => p.date !== ds) });
    } else {
      // Default new picks to the most recent times: prefer the last row's
      // times so adding several similar dates doesn't require re-typing,
      // fall back to the global Start/End if no rows exist yet.
      const last = state.spotsPickedDates[state.spotsPickedDates.length - 1];
      const start = last?.start ?? state.spotsStartTime;
      const end = last?.end ?? state.spotsEndTime;
      const next = [...state.spotsPickedDates, { date: ds, start, end }].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      set({ spotsPickedDates: next });
    }
  };

  const updatePickedDate = (date: string, patch: Partial<{ start: string; end: string }>) => {
    set({
      spotsPickedDates: state.spotsPickedDates.map((p) =>
        p.date === date ? { ...p, ...patch } : p
      ),
    });
  };

  const isSpecific = state.spotsDateMode === "specific";

  const rangeStartDate = state.spotsRangeStart ? toDate(state.spotsRangeStart) : null;
  const rangeEndDate = state.spotsRangeEnd ? toDate(state.spotsRangeEnd) : null;

  return (
    <section className="space-y-5">
      <div>
        <div
          role="radiogroup"
          aria-label="Date selection mode"
          className="inline-flex items-center gap-1 p-1 bg-[#F4FAFB] border border-[rgba(14,150,176,0.18)] rounded-full mb-3"
        >
          <button
            type="button"
            role="radio"
            aria-checked={isSpecific}
            onClick={() => set({ spotsDateMode: "specific" })}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all ${
              isSpecific ? "bg-white shadow text-[#0D2B35]" : "text-[#5A8399] hover:text-[#0D2B35]"
            }`}
          >
            Pick specific dates
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!isSpecific}
            onClick={() => set({ spotsDateMode: "range" })}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-full transition-all ${
              !isSpecific ? "bg-white shadow text-[#0D2B35]" : "text-[#5A8399] hover:text-[#0D2B35]"
            }`}
          >
            Date range
          </button>
        </div>

        <label className={labelCls}>{isSpecific ? "Specific dates" : "Date range"}</label>
        <p className="text-[12px] text-[#5A8399] mb-2">
          {isSpecific
            ? "Click each date you want a slot for. They don't have to be consecutive."
            : "One slot per day is created for every calendar day in this range."}
        </p>
        <div className="bg-[#F4FAFB] border border-[rgba(14,150,176,0.18)] rounded-xl p-3">
          {isSpecific ? (
            <DateRangePicker
              singleDate
              rangeStart={null}
              rangeEnd={null}
              selectedDates={state.spotsPickedDates.map((p) => toDate(p.date))}
              onChange={(s) => togglePickedDate(s)}
            />
          ) : (
            <DateRangePicker
              rangeStart={rangeStartDate}
              rangeEnd={rangeEndDate}
              onChange={(s, e) => {
                set({
                  spotsRangeStart: s ? dateToIso(s) : "",
                  spotsRangeEnd: e ? dateToIso(e) : "",
                });
              }}
            />
          )}
        </div>
      </div>

      {isSpecific && (
        <div>
          <label className={labelCls}>
            Times for each date <span className={sublabelCls}>(edit individually)</span>
          </label>
          {state.spotsPickedDates.length === 0 && (
            <div className="bg-[#F4FAFB] border border-dashed border-[rgba(14,150,176,0.25)] rounded-xl px-4 py-3 text-[13px] text-[#5A8399]">
              Pick a date above and a row will appear here so you can set its start and end time.
            </div>
          )}
          <ul className="space-y-2">
            {state.spotsPickedDates.map((p) => {
              const label = toDate(p.date).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <li
                  key={p.date}
                  className="grid grid-cols-[minmax(110px,auto)_1fr_1fr_auto] items-center gap-2 bg-[#F4FAFB] border border-[rgba(14,150,176,0.18)] rounded-xl px-3 py-2"
                >
                  <span className="text-[13px] font-medium text-[#0D2B35]">{label}</span>
                  <TimeInput
                    value={p.start}
                    onChange={(v) => updatePickedDate(p.date, { start: v })}
                    placeholder="Start"
                    className={inputCls}
                  />
                  <TimeInput
                    value={p.end}
                    onChange={(v) => updatePickedDate(p.date, { end: v })}
                    placeholder="End (optional)"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      set({
                        spotsPickedDates: state.spotsPickedDates.filter((x) => x.date !== p.date),
                      })
                    }
                    aria-label={`Remove ${label}`}
                    className="text-[#5A8399] hover:text-red-500 px-2"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isSpecific && <SpotsSlots state={state} set={set} />}

      {!isSpecific && (
        <div>
          <label className={labelCls}>
            Which weekdays? <span className={sublabelCls}>(optional)</span>
          </label>
          <p className="text-[12px] text-[#5A8399] mb-2">
            Limit slots to specific weekdays inside the range. Leave all selected to include every day.
          </p>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS_SHORT.map((d, i) => {
              const on = state.spotsWeekdays.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors touch-manipulation ${
                    on
                      ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                      : "bg-[#F4FAFB] border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                  }`}
                  aria-pressed={on}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isSpecific && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Start Time</label>
            <TimeInput
              value={state.spotsStartTime}
              onChange={(v) => set({ spotsStartTime: v })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              End Time <span className={sublabelCls}>(optional)</span>
            </label>
            <TimeInput
              value={state.spotsEndTime}
              onChange={(v) => set({ spotsEndTime: v })}
              placeholder="e.g. 5pm"
              className={inputCls}
            />
          </div>
        </div>
      )}

      <div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.spotsAutoSplit}
            onChange={(e) => set({ spotsAutoSplit: e.target.checked })}
            className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
          />
          <span className="text-[13px] font-medium text-[#2E5566]">
            Split the window into fixed-length appointment slots
          </span>
        </label>
        {state.spotsAutoSplit && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-[12px] text-[#5A8399]">Slot length:</label>
            <select
              value={state.spotsSlotDuration}
              onChange={(e) => set({ spotsSlotDuration: Number(e.target.value) })}
              className="text-[13px] px-2.5 py-1.5 rounded-lg border-[1.5px] border-[rgba(14,150,176,0.22)] bg-white"
            >
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!isSpecific && <BlockedDates state={state} set={set} />}
    </section>
  );
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BlockedDates({ state, set }: Props) {
  const [open, setOpen] = useState(state.spotsBlockedDates.length > 0);
  const showInput = open || state.spotsBlockedDates.length > 0;
  const setShowInput = (v: boolean) => setOpen(v);

  if (!showInput) {
    return (
      <button type="button" onClick={() => setShowInput(true)} className={linkBtnCls}>
        + Block specific dates within the range (e.g. holidays)
      </button>
    );
  }

  const removeDate = (ds: string) =>
    set({ spotsBlockedDates: state.spotsBlockedDates.filter((x) => x !== ds) });

  return (
    <div>
      <label className={labelCls}>
        Blocked dates <span className={sublabelCls}>(skipped within the range)</span>
      </label>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="date"
          min={state.spotsRangeStart || undefined}
          max={state.spotsRangeEnd || undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (!state.spotsBlockedDates.includes(v)) {
              set({ spotsBlockedDates: [...state.spotsBlockedDates, v].sort() });
            }
            e.target.value = "";
          }}
          className={inputCls}
        />
      </div>
      {state.spotsBlockedDates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {state.spotsBlockedDates.map((ds) => (
            <li key={ds}>
              <button
                type="button"
                onClick={() => removeDate(ds)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-full bg-[#F4FAFB] border-[1.5px] border-[rgba(14,150,176,0.20)] hover:border-red-300 hover:text-red-600"
              >
                {ds} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── spots: named per-date slots (classes) ─────────────────────────────────

function SpotsSlots({ state, set }: Props) {
  const rows: SlotRow[] = state.spotsSlots.map((s) => ({
    label: s.label,
    section: s.section,
    limit: s.capacity,
    id: s.id,
    hasSignups: s.hasSignups,
  }));
  return (
    <div className="pt-4 border-t border-[rgba(14,150,176,0.12)]">
      <p className="text-[12px] text-[#5A8399] mb-3">
        <span className="font-semibold text-[#2E5566]">Optional:</span> offer named slots on{" "}
        <span className="font-semibold">each</span> date — e.g. classes grouped by section, each with
        its own capacity. People pick a date, then claim a slot. Leave empty for plain time slots.
      </p>
      <SlotEditor
        rows={rows}
        onChange={(next) =>
          set({
            spotsSlots: next.map((r) => ({
              label: r.label,
              section: r.section,
              capacity: r.limit,
              id: r.id,
              hasSignups: r.hasSignups,
            })),
          })
        }
        heading="Classes / slots people can claim on each date"
        headingHint="(optional)"
        labelPlaceholders={["Class", "Class 1", "Station A", "Group 1"]}
        sectionPlaceholder="Section (optional) — e.g. Men's Side"
        setLimitLabel="Set capacity"
        addLabel="Add another slot"
        datalistId="spots-slot-section-options"
      />
    </div>
  );
}

// ── shared subcomponents ──────────────────────────────────────────────────

function TimeFields({ state, set }: Props) {
  const useApprox = state.approximateTime;
  return (
    <div>
      <label className="inline-flex items-center gap-2 cursor-pointer select-none mb-2">
        <input
          type="checkbox"
          checked={state.hasTime}
          onChange={(e) => set({ hasTime: e.target.checked })}
          className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
        />
        <span className="text-[13px] font-medium text-[#2E5566]">This event has a time</span>
      </label>

      {state.hasTime && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Start <span className={sublabelCls}>(required)</span>
              </label>
              {useApprox ? (
                <input
                  type="text"
                  value={state.startTime}
                  onChange={(e) => set({ startTime: e.target.value })}
                  placeholder="e.g. around 9am"
                  maxLength={100}
                  className={inputCls}
                />
              ) : (
                <TimeInput
                  value={state.startTime}
                  onChange={(v) => set({ startTime: v })}
                  className={inputCls}
                />
              )}
            </div>
            <div>
              <label className={labelCls}>
                End <span className={sublabelCls}>(optional)</span>
              </label>
              {useApprox ? (
                <input
                  type="text"
                  value={state.endTime}
                  onChange={(e) => set({ endTime: e.target.value })}
                  placeholder="e.g. by 5pm"
                  maxLength={100}
                  className={inputCls}
                />
              ) : (
                <TimeInput
                  value={state.endTime}
                  onChange={(v) => set({ endTime: v })}
                  placeholder="e.g. 5pm"
                  className={inputCls}
                />
              )}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none mt-2">
            <input
              type="checkbox"
              checked={useApprox}
              onChange={(e) => set({ approximateTime: e.target.checked })}
              className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
            />
            <span className="text-[12px] text-[#5A8399]">
              Use plain text instead (e.g. &quot;around 9am&quot;, &quot;dinnertime&quot;)
            </span>
          </label>
        </>
      )}
    </div>
  );
}

function ExtraTimes({ state, set }: Props) {
  const expanded = state.expanded.extraTimes || state.extraTimes.length > 0;
  const updateRow = (idx: number, patch: Partial<LabeledTime>) => {
    const next = state.extraTimes.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    set({ extraTimes: next });
  };
  const removeRow = (idx: number) =>
    set({ extraTimes: state.extraTimes.filter((_, i) => i !== idx) });
  const addRow = () =>
    set({
      extraTimes: [...state.extraTimes, { label: "", time: "" }],
      expanded: { ...state.expanded, extraTimes: true },
    });

  if (!expanded) {
    return (
      <button type="button" onClick={addRow} className={linkBtnCls}>
        + Add another time (e.g. &quot;Meet at the church&quot;)
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-[12px] font-medium text-[#2E5566]">Additional times</div>
      {state.extraTimes.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
          <input
            type="text"
            value={row.label}
            onChange={(e) => updateRow(i, { label: e.target.value })}
            placeholder="Label (e.g. Meet at church)"
            className={inputCls}
          />
          <TimeInput
            value={row.time}
            onChange={(v) => updateRow(i, { time: v })}
            placeholder="Time"
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
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
