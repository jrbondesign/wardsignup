"use client";

import { DAYS_SHORT, DURATION_PRESETS, DateRangePicker, countDaysInRange, countTithingSlotsPerDay, keepSpotsSelectionOnMouseUp, resolveSpotsDraft, selectAllSpotsOnFocus } from "@/components/edit/edit-page-shared";
import TimeInput from "@/components/TimeInput";
import { formatTimeRange } from "@/lib/utils";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Replace-schedule panel. */
export default function RescheduleForm({ ctx }: { ctx: EditEventCtx }) {
  const {
    applyReschedule,
    customDuration,
    isTithingReschedule,
    rescheduleCapacity,
    rescheduleCapacityDraft,
    rescheduleDays,
    rescheduleEnd,
    rescheduleEndTime,
    rescheduleLocation,
    rescheduleNotes,
    rescheduleStart,
    rescheduleTime,
    sessions,
    setCustomDuration,
    setRescheduleCapacity,
    setRescheduleCapacityDraft,
    setRescheduleEnd,
    setRescheduleEndTime,
    setRescheduleLocation,
    setRescheduleNotes,
    setRescheduleStart,
    setRescheduleTime,
    setShowReschedule,
    setTithingCapacity,
    setTithingCapacityDraft,
    setTithingDuration,
    showReschedule,
    tithingCapacity,
    tithingCapacityDraft,
    tithingDays,
    tithingDuration,
    toggleRescheduleDay,
    toggleTithingDay,
  } = ctx;

  return (
    showReschedule && (
    <div id="replace-schedule" className="border border-amber-200 rounded-xl p-5 space-y-5 bg-white overflow-x-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#0D2B35]">Replace all slots</div>
          <div className="text-xs text-[#5A8399]">Regenerate slots using the settings below</div>
        </div>
        <button
          type="button"
          onClick={() => setShowReschedule(false)}
          className="text-xs font-semibold text-[#08647E] hover:text-[#0E96B0] transition-colors"
        >
          Close
        </button>
      </div>
      <div>
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
          {isTithingReschedule ? "Schedule Dates" : "New Date Range"}
        </label>
        <DateRangePicker
          rangeStart={rescheduleStart}
          rangeEnd={rescheduleEnd}
          onChange={(s, e) => { setRescheduleStart(s); setRescheduleEnd(e); }}
          initialMonth={rescheduleStart ?? undefined}
        />
      </div>

      <div>
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
          Days of Week
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 min-w-0">
          {DAYS_SHORT.map((d, i) => {
            const selected = isTithingReschedule ? tithingDays.includes(i) : rescheduleDays.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => (isTithingReschedule ? toggleTithingDay(i) : toggleRescheduleDay(i))}
                className={`w-full min-w-0 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                  selected
                    ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                    : "bg-[#F4FAFB] border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        {!isTithingReschedule && (
          <p className="text-[12px] text-[#5A8399] mt-2">
            Sessions will be created only on these days within the date range.
          </p>
        )}
      </div>

      <div className={isTithingReschedule ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
        <div>
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
            {isTithingReschedule ? "Start Time" : "Start Time"}
          </label>
          <TimeInput
            value={rescheduleTime}
            onChange={setRescheduleTime}
            className={
              isTithingReschedule
                ? "w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                : "w-full text-base text-[#0D2B35] px-[14px] py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            }
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
            {isTithingReschedule ? "End Time" : "End Time (Optional)"}
          </label>
          <TimeInput
            value={rescheduleEndTime}
            onChange={setRescheduleEndTime}
            placeholder="e.g. 9pm"
            className={
              isTithingReschedule
                ? "w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                : "w-full text-base text-[#0D2B35] px-[14px] py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            }
          />
        </div>
      </div>

      {isTithingReschedule ? (
        <div className="space-y-5">
          {/* Session duration (match create) */}
          <div>
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
              Session Duration
            </label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_PRESETS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setTithingDuration(mins);
                    setCustomDuration("");
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tithingDuration === mins && customDuration === ""
                      ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                      : "bg-[#F4FAFB] border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
                  }`}
                >
                  {mins} min
                </button>
              ))}
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="1"
                  max="240"
                  placeholder="Custom"
                  value={customDuration}
                  onChange={(e) => {
                    setCustomDuration(e.target.value);
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v > 0) setTithingDuration(v);
                  }}
                  className={`w-24 text-sm text-[#0D2B35] px-3 py-2 border-[1.5px] rounded-lg outline-none transition-all placeholder:text-[#5A8399] placeholder:opacity-70 ${
                    customDuration !== ""
                      ? "border-[#0E96B0] bg-[#E6F7FB] shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                      : "border-[rgba(14,150,176,0.22)] bg-[#F4FAFB] focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                  }`}
                />
                {customDuration !== "" && (
                  <span className="absolute right-3 text-[11px] text-[#5A8399]">min</span>
                )}
              </div>
            </div>
          </div>

          {/* Spots per slot (match create) */}
          <div>
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
              Spots available
            </label>
            <p className="text-[12px] text-[#5A8399] mb-2">
              How many people or families can sign up for this session?
            </p>
            <input
              type="number"
              min="1"
              value={
                tithingCapacityDraft !== undefined
                  ? tithingCapacityDraft
                  : String(tithingCapacity)
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "" || /^\d+$/.test(raw)) {
                  setTithingCapacityDraft(raw);
                  if (raw !== "") {
                    const n = parseInt(raw, 10);
                    if (n >= 1) setTithingCapacity(n);
                  }
                }
              }}
              onBlur={() => {
                setTithingCapacityDraft((draft) => {
                  if (draft === undefined) return undefined;
                  const final = resolveSpotsDraft(draft, tithingCapacity);
                  queueMicrotask(() => setTithingCapacity(final));
                  return undefined;
                });
              }}
              onFocus={selectAllSpotsOnFocus}
              onMouseUp={keepSpotsSelectionOnMouseUp}
              className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
              Spots available
            </label>
            <p className="text-[12px] text-[#5A8399] mb-2">
              How many people or families can sign up for this session?
            </p>
            <input
              type="number"
              min="1"
              value={
                rescheduleCapacityDraft !== undefined
                  ? rescheduleCapacityDraft
                  : String(rescheduleCapacity)
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "" || /^\d+$/.test(raw)) {
                  setRescheduleCapacityDraft(raw);
                  if (raw !== "") {
                    const n = parseInt(raw, 10);
                    if (n >= 1) setRescheduleCapacity(n);
                  }
                }
              }}
              onBlur={() => {
                setRescheduleCapacityDraft((draft) => {
                  if (draft === undefined) return undefined;
                  const final = resolveSpotsDraft(draft, rescheduleCapacity);
                  queueMicrotask(() => setRescheduleCapacity(final));
                  return undefined;
                });
              }}
              onFocus={selectAllSpotsOnFocus}
              onMouseUp={keepSpotsSelectionOnMouseUp}
              className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
            Location
          </label>
          <input
            type="text"
            value={rescheduleLocation}
            onChange={(e) => setRescheduleLocation(e.target.value)}
            placeholder="e.g., Meetinghouse"
            className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
            Notes <span className="font-normal text-[#5A8399]">(optional)</span>
          </label>
          <input
            type="text"
            value={rescheduleNotes}
            onChange={(e) => setRescheduleNotes(e.target.value)}
            placeholder="Optional"
            className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
          />
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        {isTithingReschedule
          ? "This will replace all existing slots with new ones across the new range."
          : `This will replace all ${sessions.length} existing slot${sessions.length !== 1 ? "s" : ""} with new slots based on the settings above.`}
      </div>

      <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-[18px] py-[14px] text-sm leading-relaxed text-[#2E5566]">
        <strong className="text-[#0D2B35] font-semibold">Ready to go:</strong>{" "}
        {rescheduleStart && rescheduleEnd
          ? (() => {
              if (isTithingReschedule) {
                if (tithingDays.length === 0) return "Choose days of week to generate slots.";
                const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, tithingDays);
                const perDay = countTithingSlotsPerDay(rescheduleTime, rescheduleEndTime, tithingDuration);
                const total = dayCount * perDay;
                return total > 0
                  ? `${total} slot${total !== 1 ? "s" : ""} will be created — ${tithingDuration}-min appointments, ${formatTimeRange(rescheduleTime, rescheduleEndTime)}.`
                  : "Configure the schedule above to auto-generate slots.";
              }

              if (rescheduleDays.length === 0) return "Choose days of week to generate slots.";
              const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, rescheduleDays);
              return dayCount > 0
                ? `${dayCount} session${dayCount !== 1 ? "s" : ""} will be created — ${formatTimeRange(rescheduleTime, rescheduleEndTime)}.`
                : "Choose a date range and days of week to generate slots.";
            })()
          : "Choose a date range to see a preview."}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowReschedule(false)}
          className="flex-1 text-sm font-semibold px-4 py-[10px] rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={applyReschedule}
          disabled={
            !rescheduleStart ||
            !rescheduleEnd ||
            (isTithingReschedule ? tithingDays.length === 0 : rescheduleDays.length === 0)
          }
          className={`flex-1 text-sm font-semibold px-4 py-[10px] rounded-xl text-white transition-all ${
            rescheduleStart &&
            rescheduleEnd &&
            (!isTithingReschedule || tithingDays.length > 0)
              ? "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5"
              : "bg-[#C8DDE6] cursor-default"
          }`}
        >
          {rescheduleStart && rescheduleEnd
            ? (() => {
                if (!isTithingReschedule) {
                  const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, rescheduleDays);
                  return `Apply: ${dayCount} slot${dayCount === 1 ? "" : "s"}`;
                }
                const dayCount = countDaysInRange(rescheduleStart, rescheduleEnd, tithingDays);
                const perDay = countTithingSlotsPerDay(rescheduleTime, rescheduleEndTime, tithingDuration);
                const total = dayCount * perDay;
                return `Apply — ${total} slot${total === 1 ? "" : "s"}`;
              })()
            : "Select a date range"}
        </button>
      </div>
    </div>
  )
  );
}
