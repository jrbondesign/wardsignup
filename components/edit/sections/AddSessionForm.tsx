"use client";

import { DAYS, DateRangePicker, keepSpotsSelectionOnMouseUp, selectAllSpotsOnFocus } from "@/components/edit/edit-page-shared";
import TimeInput from "@/components/TimeInput";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Add-one-session panel. */
export default function AddSessionForm({ ctx }: { ctx: EditEventCtx }) {
  const {
    addSession,
    newSessionCapacity,
    newSessionDateObj,
    newSessionDayOfWeek,
    newSessionEndTime,
    newSessionLabel,
    newSessionLocation,
    newSessionNotes,
    newSessionSection,
    newSessionTime,
    newSessionUseDate,
    setNewSessionCapacity,
    setNewSessionDate,
    setNewSessionDateObj,
    setNewSessionDayOfWeek,
    setNewSessionEndTime,
    setNewSessionLabel,
    setNewSessionLocation,
    setNewSessionNotes,
    setNewSessionSection,
    setNewSessionTime,
    setNewSessionUseDate,
    setShowAddSession,
    showAddSession,
  } = ctx;

  return (
    showAddSession && (
    <div id="add-one-session" className="mt-3 bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#0D2B35]">Add one slot</div>
          <div className="text-xs text-[#5A8399]">Pick a single date or day-of-week</div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddSession(false)}
          className="text-xs font-semibold text-[#08647E] hover:text-[#0E96B0] transition-colors"
        >
          Close
        </button>
      </div>
      {/* Date type toggle */}
      <div className="flex gap-2">
        <button type="button" onClick={() => setNewSessionUseDate(true)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors touch-manipulation ${newSessionUseDate ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white" : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0]"}`}>
          Specific Date
        </button>
        <button type="button" onClick={() => setNewSessionUseDate(false)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors touch-manipulation ${!newSessionUseDate ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white" : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0]"}`}>
          Day of Week
        </button>
      </div>

      {newSessionUseDate ? (
        <div id="edit-individual-date" className="p-2 -m-1 rounded-xl">
          <DateRangePicker
            singleDate
            rangeStart={newSessionDateObj}
            rangeEnd={null}
            onChange={(s) => {
              setNewSessionDateObj(s);
              if (s) {
                const y = s.getFullYear();
                const m = String(s.getMonth() + 1).padStart(2, '0');
                const d = String(s.getDate()).padStart(2, '0');
                setNewSessionDate(`${y}-${m}-${d}`);
              } else {
                setNewSessionDate("");
              }
            }}
          />
        </div>
      ) : (
        <div id="edit-individual-date">
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">
            Day of week *
          </label>
          <p className="text-[12px] text-[#5A8399] mb-2">
            Recurring weekly — not tied to one calendar date. People pick “Fridays” (for
            example) until you remove the slot.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {DAYS.map((day, i) => (
              <button key={i} type="button" onClick={() => setNewSessionDayOfWeek(i)}
                className={`px-2 py-2 rounded-xl text-sm font-medium transition-colors touch-manipulation ${newSessionDayOfWeek === i ? "bg-gradient-to-br from-[#0E96B0] to-[#08647E] text-white" : "bg-white border-[1.5px] border-[rgba(14,150,176,0.22)] text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB]"}`}>
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
            Section <span className="font-normal text-[#5A8399]">(optional)</span>
          </label>
          <input type="text" list="edit-session-sections" value={newSessionSection}
            onChange={(e) => setNewSessionSection(e.target.value)}
            placeholder="e.g. Women's Side"
            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
          />
          <p className="text-[12px] text-[#5A8399] mt-1">Groups slots under a header (e.g. Women&apos;s Side).</p>
        </div>
        <div className="min-w-0">
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">
            Class name <span className="font-normal text-[#5A8399]">(optional)</span>
          </label>
          <input type="text" value={newSessionLabel}
            onChange={(e) => setNewSessionLabel(e.target.value)}
            placeholder="e.g. Women's Class"
            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
          />
          <p className="text-[12px] text-[#5A8399] mt-1">Names this specific claimable slot.</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Start Time *</label>
            <TimeInput value={newSessionTime} onChange={setNewSessionTime}
              className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">End Time</label>
            <TimeInput value={newSessionEndTime} onChange={setNewSessionEndTime} placeholder="e.g. 5pm"
              className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
            />
          </div>
        </div>

        <div className="min-w-0">
          <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1">Spots available *</label>
          <p className="text-[12px] text-[#5A8399] mb-2">
            How many people or families can sign up for this session?
          </p>
          <input type="number" min="1" value={newSessionCapacity} onChange={(e) => setNewSessionCapacity(parseInt(e.target.value))}
            onFocus={selectAllSpotsOnFocus}
            onMouseUp={keepSpotsSelectionOnMouseUp}
            className="w-full min-w-0 text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
          />
        </div>
      </div>

      <div>
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Location</label>
        <input type="text" value={newSessionLocation} onChange={(e) => setNewSessionLocation(e.target.value)}
          placeholder="e.g., Meetinghouse"
          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
        />
      </div>

      <div>
        <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-2">Notes (Optional)</label>
        <textarea value={newSessionNotes} onChange={(e) => setNewSessionNotes(e.target.value)}
          placeholder="Additional details..." rows={2}
          className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
        />
      </div>

      <button type="button" onClick={addSession}
        className="w-full text-base font-semibold px-4 py-[13px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)] transition-all touch-manipulation">
        Add Session
      </button>
    </div>
  )
  );
}
