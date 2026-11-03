"use client";

import { DAYS, DateRangePicker, keepSpotsSelectionOnMouseUp, resolveSpotsDraft, selectAllSpotsOnFocus } from "@/components/edit/edit-page-shared";
import TimeInput from "@/components/TimeInput";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Add-multiple-sessions panel. */
export default function BulkAddSessionsForm({ ctx }: { ctx: EditEventCtx }) {
  const {
    addBulkSessions,
    bulkCapacity,
    bulkCapacityDraft,
    bulkDays,
    bulkEndTime,
    bulkLocation,
    bulkNotes,
    bulkRangeEnd,
    bulkRangeStart,
    bulkTime,
    calculateSessionCount,
    setBulkCapacity,
    setBulkCapacityDraft,
    setBulkEndDate,
    setBulkEndTime,
    setBulkLocation,
    setBulkNotes,
    setBulkRangeEnd,
    setBulkRangeStart,
    setBulkStartDate,
    setBulkTime,
    setShowBulk,
    showBulk,
    toggleBulkDay,
  } = ctx;

  return (
    showBulk && (
    <div id="add-multiple-sessions" className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#0D2B35]">Add multiple slots</div>
          <div className="text-xs text-[#5A8399]">Same time &amp; details across several days</div>
        </div>
        <button
          type="button"
          onClick={() => setShowBulk(false)}
          className="text-xs font-semibold text-[#08647E] hover:text-[#0E96B0] transition-colors"
        >
          Close
        </button>
      </div>

      <p className="text-[12px] text-[#2E5566] leading-relaxed border-b border-[rgba(14,150,176,0.12)] pb-3">
        <span className="font-semibold text-[#0D2B35]">How this works:</span> Choose a{" "}
        <strong>date range</strong> first (optional). Then choose which{" "}
        <strong>weekdays</strong> count. We only create sessions on those weekdays that fall
        inside the range. Leave the calendar empty for <strong>recurring every week</strong>{" "}
        (no specific dates).
      </p>

      <div id="edit-bulk-calendar">
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
          Date range <span className="font-normal text-[#5A8399]">(optional)</span>
        </label>
        <p className="text-[12px] text-[#5A8399] mb-2">
          Tap start, then end — tap the same day twice for a single day. Skip this step for
          weekly recurring slots.
        </p>
        <div className="p-2 -m-1 rounded-xl">
          <DateRangePicker
            rangeStart={bulkRangeStart}
            rangeEnd={bulkRangeEnd}
            onChange={(s, e) => {
              setBulkRangeStart(s);
              setBulkRangeEnd(e);
              const fmt = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              setBulkStartDate(s ? fmt(s) : "");
              setBulkEndDate(e ? fmt(e) : "");
            }}
          />
        </div>
      </div>

      <div id="edit-bulk-days">
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
          Which weekdays? *
        </label>
        <p className="text-[12px] text-[#5A8399] mb-2">
          With a date range: only those calendar dates that match these weekdays. Without a
          range: one recurring slot per selected weekday.
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {DAYS.map((day, index) => (
            <button
              key={index}
              type="button"
              onClick={() => toggleBulkDay(index)}
              className={`px-2 py-2 rounded-xl text-sm font-medium transition-colors touch-manipulation ${
                bulkDays.includes(index)
                  ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white"
                  : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Time and spots */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
              Start Time *
            </label>
            <TimeInput
              value={bulkTime}
              onChange={setBulkTime}
              className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
              End Time
            </label>
            <TimeInput
              value={bulkEndTime}
              onChange={setBulkEndTime}
              placeholder="e.g. 5pm"
              className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            />
          </div>
        </div>

        <div className="min-w-0">
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
            Spots available *
          </label>
          <p className="text-[12px] text-[#5A8399] mb-2">
            How many people or families can sign up for this session?
          </p>
          <input
            type="number"
            min="1"
            value={
              bulkCapacityDraft !== undefined
                ? bulkCapacityDraft
                : String(bulkCapacity)
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "" || /^\d+$/.test(raw)) {
                setBulkCapacityDraft(raw);
                if (raw !== "") {
                  const n = parseInt(raw, 10);
                  if (Number.isFinite(n) && n >= 1) {
                    setBulkCapacity(n);
                  }
                }
              }
            }}
            onBlur={() => {
              setBulkCapacityDraft((draft) => {
                if (draft === undefined) return undefined;
                const final = resolveSpotsDraft(draft, bulkCapacity);
                queueMicrotask(() => setBulkCapacity(final));
                return undefined;
              });
            }}
            onFocus={selectAllSpotsOnFocus}
            onMouseUp={keepSpotsSelectionOnMouseUp}
            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
          Location
        </label>
        <input
          type="text"
          value={bulkLocation}
          onChange={(e) => setBulkLocation(e.target.value)}
          placeholder="e.g., Meetinghouse"
          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
          Notes (Optional)
        </label>
        <textarea
          value={bulkNotes}
          onChange={(e) => setBulkNotes(e.target.value)}
          placeholder="Additional details..."
          rows={2}
          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
        />
      </div>

      <button
        type="button"
        onClick={addBulkSessions}
        className="w-full text-base font-semibold px-4 py-[13px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)] transition-all touch-manipulation"
      >
        {(() => {
          const count = calculateSessionCount();
          return count > 0 ? `Add ${count} Session${count > 1 ? 's' : ''}` : 'Add Sessions';
        })()}
      </button>
    </div>
  )
  );
}
