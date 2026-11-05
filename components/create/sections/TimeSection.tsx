"use client";

import { useRef, useState } from "react";
import TimeInput, { TimeRangeRow, TimeTextLabel } from "@/components/TimeInput";
import DateRangePicker from "@/components/DateRangePicker";
import EventDatesPicker from "@/components/create/EventDatesPicker";
import SlotEditor, { type SlotRow } from "@/components/create/SlotEditor";
import {
  CREATE_EVENT_TIMES_ROW_ID,
  CREATE_SPOTS_TIMES_ROW_ID,
  createSpotsWindowRowId,
  createTimeOrderIssue,
  isMultiDayRsvp,
  type CreateFormState,
  type LabeledTime,
} from "@/lib/create-form-state";
import {
  TIME_ORDER_ERROR,
  isEndSameAsStart,
  isOvernightRange,
  EMPTY_APPROXIMATE_TIME_MEMORY,
  type ApproximateTimeMemory,
  switchApproximateMode,
} from "@/lib/utils";

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
      // Date already has a window — do nothing (user can remove via × button)
      return;
    }
    // Default new picks to the most recent times: prefer the last row's
    // times so adding several similar dates doesn't require re-typing,
    // fall back to the global Start/End if no rows exist yet.
    const last = state.spotsPickedDates[state.spotsPickedDates.length - 1];
    const start = last?.start ?? state.spotsStartTime;
    const end = last?.end ?? state.spotsEndTime;
    const id = `${ds}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const next = [...state.spotsPickedDates, { id, date: ds, start, end }].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    set({ spotsPickedDates: next });
  };

  const updatePickedDate = (id: string, patch: Partial<{ start: string; end: string }>) => {
    set({
      spotsPickedDates: state.spotsPickedDates.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
  };

  const addAnotherWindow = (date: string) => {
    const last = state.spotsPickedDates.filter((p) => p.date === date).slice(-1)[0];
    const start = last?.start ?? state.spotsStartTime;
    const end = last?.end ?? state.spotsEndTime;
    const id = `${date}-${crypto.randomUUID()}`;
    const next = [...state.spotsPickedDates, { id, date, start, end }];
    set({ spotsPickedDates: next });
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
          <ul className="space-y-3">
            {(() => {
              // Group windows by date for better UX
              const byDate = new Map<string, typeof state.spotsPickedDates>();
              for (const p of state.spotsPickedDates) {
                const arr = byDate.get(p.date) ?? [];
                arr.push(p);
                byDate.set(p.date, arr);
              }
              
              return Array.from(byDate.entries()).map(([date, windows]) => {
                const label = toDate(date).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <li key={date} className="space-y-2">
                    {windows.map((p, idx) => (
                      <div
                        key={p.id}
                        className="bg-[#F4FAFB] border border-[rgba(14,150,176,0.18)] rounded-xl px-3 pt-2 pb-3"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[13px] font-semibold text-[#0D2B35]">
                            {idx === 0 ? label : `${label}, window ${idx + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              set({
                                spotsPickedDates: state.spotsPickedDates.filter((x) => x.id !== p.id),
                              })
                            }
                            aria-label={`Remove ${label} window ${idx + 1}`}
                            className="min-h-11 sm:min-h-0 sm:py-1 px-2 -mr-2 text-[13px] font-medium text-[#0E96B0] hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                        <TimeRangeRow
                          id={createSpotsWindowRowId(p.id)}
                          start={
                            <TimeInput
                              value={p.start}
                              onChange={(v) => updatePickedDate(p.id, { start: v })}
                              label="Start time"
                              labelNote="(required)"
                              ariaLabel={`Start time for ${label}`}
                              required
                              className={inputCls}
                            />
                          }
                          end={
                            <TimeInput
                              value={p.end}
                              onChange={(v) => updatePickedDate(p.id, { end: v })}
                              label="End time"
                              labelNote={isOvernightRange(p.start, p.end) ? "(next day)" : "(optional)"}
                              ariaLabel={`End time for ${label}`}
                              error={isEndSameAsStart(p.start, p.end) ? TIME_ORDER_ERROR : undefined}
                              className={inputCls}
                            />
                          }
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addAnotherWindow(date)}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-[#0E96B0] hover:text-[#08647E] transition-colors ml-1"
                    >
                      <span className="w-4 h-4 rounded bg-[#E6F7FB] flex items-center justify-center text-[10px]">+</span>
                      Add another window for {label}
                    </button>
                  </li>
                );
              });
            })()}
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
        <TimeRangeRow
          id={CREATE_SPOTS_TIMES_ROW_ID}
          start={
            <TimeInput
              value={state.spotsStartTime}
              onChange={(v) => set({ spotsStartTime: v })}
              label="Start time"
              labelNote="(required)"
              required
              className={inputCls}
            />
          }
          end={
            <TimeInput
              value={state.spotsEndTime}
              onChange={(v) => set({ spotsEndTime: v })}
              label="End time"
              labelNote={isOvernightRange(state.spotsStartTime, state.spotsEndTime) ? "(next day)" : "(optional)"}
              error={isEndSameAsStart(state.spotsStartTime, state.spotsEndTime) ? TIME_ORDER_ERROR : undefined}
              className={inputCls}
            />
          }
        />
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
  const memoryRef = useRef<ApproximateTimeMemory>({ ...EMPTY_APPROXIMATE_TIME_MEMORY });
  const [approxNote, setApproxNote] = useState("");
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
          <TimeRangeRow
            id={CREATE_EVENT_TIMES_ROW_ID}
            start={
              useApprox ? (
                <div className="min-w-0 w-full sm:w-auto sm:flex-1">
                  <TimeTextLabel htmlFor="event-start-text" label="Start time" labelNote="(required)" />
                  <input
                    id="event-start-text"
                    type="text"
                    value={state.startTime}
                    onChange={(e) => set({ startTime: e.target.value })}
                    placeholder="e.g. around 9am"
                    maxLength={100}
                    className={inputCls}
                  />
                </div>
              ) : (
                <TimeInput
                  value={state.startTime}
                  onChange={(v) => set({ startTime: v })}
                  label="Start time"
                  labelNote="(required)"
                  required
                  className={inputCls}
                />
              )
            }
            end={
              useApprox ? (
                <div className="min-w-0 w-full sm:w-auto sm:flex-1">
                  <TimeTextLabel htmlFor="event-end-text" label="End time" labelNote="(optional)" />
                  <input
                    id="event-end-text"
                    type="text"
                    value={state.endTime}
                    onChange={(e) => set({ endTime: e.target.value })}
                    placeholder="e.g. by 5pm"
                    maxLength={100}
                    className={inputCls}
                  />
                </div>
              ) : (
                <TimeInput
                  value={state.endTime}
                  onChange={(v) => set({ endTime: v })}
                  label="End time"
                  labelNote={!isMultiDayRsvp(state) && isOvernightRange(state.startTime, state.endTime) ? "(next day)" : "(optional)"}
                  error={createTimeOrderIssue(state)?.rowId === CREATE_EVENT_TIMES_ROW_ID ? TIME_ORDER_ERROR : undefined}
                  className={inputCls}
                />
              )
            }
          />
          <label className="inline-flex items-center gap-2 cursor-pointer select-none mt-2">
            <input
              type="checkbox"
              checked={useApprox}
              onChange={(e) => {
                const next = e.target.checked;
                const result = switchApproximateMode({
                  toApproximate: next,
                  startTime: state.startTime,
                  endTime: state.endTime,
                  memory: memoryRef.current,
                });
                memoryRef.current = result.memory;
                setApproxNote(result.note);
                set({
                  approximateTime: next,
                  startTime: result.startTime,
                  endTime: result.endTime,
                });
              }}
              className="w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
            />
            <span className="text-[12px] text-[#5A8399]">
              Use plain text instead (e.g. &quot;around 9am&quot;, &quot;dinnertime&quot;)
            </span>
          </label>
          {approxNote ? (
            <p className="mt-2 text-[12px] text-amber-800">{approxNote}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

let extraTimeKeySeq = 0;
const newExtraTimeKey = () => `extra-time-${++extraTimeKeySeq}`;

function ExtraTimes({ state, set }: Props) {
  const expanded = state.expanded.extraTimes || state.extraTimes.length > 0;
  const rows = state.extraTimes;
  // Stable React keys kept only in component state (LabeledTime stays { label, time }),
  // so removing a row never hands its unfinished picks to the next row.
  const [keys, setKeys] = useState<string[]>(() => rows.map(newExtraTimeKey));
  if (keys.length !== rows.length) {
    const next = keys.slice(0, rows.length);
    while (next.length < rows.length) next.push(newExtraTimeKey());
    setKeys(next);
  }
  const updateRow = (idx: number, patch: Partial<LabeledTime>) => {
    const next = rows.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    set({ extraTimes: next });
  };
  const removeRow = (idx: number) => {
    setKeys((prev) => prev.filter((_, i) => i !== idx));
    set({ extraTimes: rows.filter((_, i) => i !== idx) });
  };
  const addRow = () =>
    set({
      extraTimes: [...rows, { label: "", time: "" }],
      expanded: { ...state.expanded, extraTimes: true },
    });
  // Accessible names stay unique: repeated labels get the row number.
  const labelCounts = new Map<string, number>();
  rows.forEach((r) => {
    const k = r.label.trim().toLowerCase();
    if (k) labelCounts.set(k, (labelCounts.get(k) ?? 0) + 1);
  });
  const rowName = (row: LabeledTime, i: number) => {
    const label = row.label.trim();
    if (!label) return `additional time ${i + 1}`;
    return (labelCounts.get(label.toLowerCase()) ?? 0) > 1 ? `${label} time (row ${i + 1})` : `${label} time`;
  };
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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
      {rows.map((row, i) => (
        // Label and Remove share the top line so the 44px Remove target never
        // sits on top of the time selects, even at 320px.
        <div key={keys[i] ?? `pending-${i}`} className="space-y-2" data-extra-time-row="">
          <div className="flex gap-2 items-center min-w-0">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              placeholder="Label (e.g. Meet at church)"
              aria-label={`Label for additional time ${i + 1}`}
              className={`${inputCls} flex-1 min-w-0`}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label={`Remove ${rowName(row, i)}`}
              className="shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-xl text-[#5A8399] hover:text-red-600 hover:bg-red-50 text-lg leading-none"
            >
              ×
            </button>
          </div>
          {/* @container so the selects use compact sizing whenever the card is 560px+, like Start and End. */}
          <div className="@container min-w-0">
            <TimeInput
              value={row.time}
              onChange={(v) => updateRow(i, { time: v })}
              label="Time"
              labelVariant="micro"
              ariaLabel={cap(rowName(row, i))}
              className={inputCls}
            />
          </div>
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
