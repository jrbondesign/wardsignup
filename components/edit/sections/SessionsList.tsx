"use client";

import { groupSessionsForDisplay } from "@/lib/edit-session-classes";
import { cardLocation, dayMenuLabel, formatDayHeading, reorderStep, sharedLocations } from "@/lib/edit-slot-actions";
import ReorderPanel from "@/components/edit/ReorderPanel";
import { DAYS, dayShortLabel, keepSpotsSelectionOnMouseUp, selectAllSpotsOnFocus } from "@/components/edit/edit-page-shared";
import { formatTimeRange } from "@/lib/utils";
import MenuTrigger from "@/components/edit/MenuTrigger";
import SectionHeader from "@/components/edit/SectionHeader";
import TimeInput from "@/components/TimeInput";
import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Day-grouped slot cards (or the empty state). */
export default function SessionsList({ ctx }: { ctx: EditEventCtx }) {
  const {
    addClassToDate,
    capacityInputDraft,
    commitCapacityDraft,
    dragOverIndex,
    draggingIndex,
    editingSessionIndex,
    highlightDate,
    reorderGroupKey,
    reorderSlot,
    sessions,
    setCapacityInputDraft,
    setDayMenuButtonEl,
    setDayMenuGroupKey,
    setDayMenuSecondStep,
    setDayMenuSecondStepDate,
    setDragOverIndex,
    setDraggingIndex,
    setEditingSessionIndex,
    setReorderGroupKey,
    setSectionMenu,
    setSectionMenuButtonEl,
    setSectionMenuStep,
    setSectionRenameDraft,
    setSlotMenuButtonEl,
    setSlotMenuIndex,
    signupsBySession,
    updateSession,
  } = ctx;

  return (
    sessions.length === 0 ? (
    <div
      id="edit-sessions-empty"
      className="bg-[#F4FAFB] rounded-xl p-6 text-center text-sm text-[#5A8399]"
    >
      No sessions yet. Use <span className="font-medium text-[#2E5566]">Add sessions</span>{" "}
      above — <span className="font-medium text-[#2E5566]">Add multiple slots</span> or{" "}
      <span className="font-medium text-[#2E5566]">Add one slot</span>.
    </div>
  ) : (
    <div className="space-y-6">
      {groupSessionsForDisplay(sessions).map((group) => {
        const groupLocs = sharedLocations(group);
        return (
        <div
          key={group.key}
          id={group.sessionDate ? `edit-date-${group.sessionDate}` : undefined}
          className={`space-y-2 scroll-mt-24 rounded-xl transition-shadow duration-700 ${
            highlightDate && group.sessionDate === highlightDate
              ? "shadow-[0_0_0_3px_rgba(14,150,176,0.35)]"
              : ""
          }`}
        >
          {reorderGroupKey === group.key ? (
            <ReorderPanel
              dayLabel={dayShortLabel(group)}
              rows={group.items.map(({ session, index }, pos) => {
                const title = (session.label ?? "").trim();
                const time = formatTimeRange(session.time, session.end_time);
                return {
                  key: index,
                  name: title || time,
                  detail: title ? time : undefined,
                  section: session.section,
                  canMoveUp: reorderStep(group, pos, "up") !== null,
                  canMoveDown: reorderStep(group, pos, "down") !== null,
                };
              })}
              onMove={(pos, direction) => {
                const step = reorderStep(group, pos, direction);
                if (step) reorderSlot(step.fromIndex, step.toIndex);
              }}
              onDone={() => setReorderGroupKey(null)}
            />
          ) : (
          <>
          {/* Date header: date on its own line, one three dots menu at the
              right (aligned with the slot cards' menus), shared location below. */}
          <div className="pl-0.5 pr-[17px] md:pr-[21px]">
            <div className="flex items-center gap-2">
              <div className="font-serif text-[17px] text-[#0D2B35] whitespace-nowrap leading-tight flex-1 min-w-0">
                {group.sessionDate ? (
                  // Narrow phones get the short weekday so the date never wraps;
                  // swapped in CSS so server and client render the same markup.
                  <>
                    <span className="min-[360px]:hidden">{formatDayHeading(group, "short")}</span>
                    <span className="hidden min-[360px]:inline">{formatDayHeading(group)}</span>
                  </>
                ) : (
                  DAYS[group.dayOfWeek]
                )}
              </div>
              <MenuTrigger
                label={dayMenuLabel(group)}
                onOpen={(el) => {
                  setDayMenuSecondStep(null);
                  setDayMenuSecondStepDate("");
                  setDayMenuGroupKey(group.key);
                  setDayMenuButtonEl(el);
                }}
              />
            </div>
            {groupLocs.day && (
              <div className="text-[12px] text-[#5A8399] truncate -mt-1" title={groupLocs.day}>
                {groupLocs.day}
              </div>
            )}
          </div>
          {group.items.map(({ session, index }, itemIdx, itemArr) => {
            const sectionKey = (session.section ?? "").trim();
            const prevKey = itemIdx > 0 ? (itemArr[itemIdx - 1].session.section ?? "").trim() : "";
            const showHeader = sectionKey !== "" && sectionKey !== prevKey;
            const classTitle = (session.label ?? "").trim();
            return (
              <div key={session.id ?? `${group.key}-${index}`}>
                {/* Section header: shown when the section changes within a date */}
                {showHeader && (
                  <SectionHeader
                    name={sectionKey}
                    sharedLocation={groupLocs.bySection[sectionKey]}
                    onOpenMenu={(el) => {
                      setSectionMenuStep(null);
                      setSectionRenameDraft("");
                      setSectionMenu({ groupKey: group.key, section: sectionKey });
                      setSectionMenuButtonEl(el);
                    }}
                  />
                )}
                <div
                  draggable={editingSessionIndex !== index}
                  onDragStart={(e) => {
                    setDraggingIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDraggingIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    if (
                      draggingIndex !== null &&
                      draggingIndex !== index &&
                      (sessions[draggingIndex]?.session_date ?? "") === (session.session_date ?? "")
                    ) {
                      e.preventDefault();
                      setDragOverIndex(index);
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverIndex((cur) => (cur === index ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingIndex !== null) reorderSlot(draggingIndex, index);
                    setDraggingIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={(e) => {
                    if (editingSessionIndex === index) return;
                    if ((e.target as HTMLElement).closest('button[aria-label^="Options for"]')) return;
                    setEditingSessionIndex((cur) => {
                      if (cur !== null && cur !== index) {
                        commitCapacityDraft(cur);
                      }
                      return index;
                    });
                  }}
                  className={`border rounded-xl p-4 md:p-5 bg-white group transition-shadow cursor-pointer ${
                    dragOverIndex === index
                      ? "border-[#0E96B0] shadow-[0_0_0_2px_rgba(14,150,176,0.35)]"
                      : "border-[rgba(14,150,176,0.16)]"
                  } ${draggingIndex === index ? "opacity-50" : ""} ${
                    editingSessionIndex !== index ? "hover:border-[#0E96B0]/40" : ""
                  }`}
                >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 flex items-start gap-2.5">
              {editingSessionIndex !== index && (
                <span
                  title="Drag to reorder"
                  className="mt-0.5 cursor-grab active:cursor-grabbing text-[#A0B7C2] hover:text-[#0E96B0] transition-colors flex-shrink-0 touch-none hidden md:block"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>
              )}
            <div className="min-w-0 flex-1">
              {classTitle && (
                <div className="text-[14px] font-semibold text-[#0D2B35] leading-tight">
                  {classTitle}
                </div>
              )}
              <div className={`text-xs text-[#5A8399] whitespace-nowrap ${classTitle ? "mt-1" : "text-[14px] font-semibold text-[#0D2B35] leading-tight"}`}>
                {formatTimeRange(session.time, session.end_time)}
              </div>
              <div className="text-[11px] text-[#5A8399] mt-1">
                {session.id ? (
                  <>
                    {signupsBySession[session.id] ?? 0} of {session.capacity} {session.capacity === 1 ? "spot" : "spots"} filled
                  </>
                ) : (
                  <>
                    {session.capacity} {session.capacity === 1 ? "spot" : "spots"}
                  </>
                )}
              </div>
              {(() => {
                const ownLoc = cardLocation(session, groupLocs);
                return ownLoc ? (
                  <div className="text-[11px] text-[#5A8399] mt-1 truncate" title={ownLoc}>
                    {ownLoc}
                  </div>
                ) : null;
              })()}
              {(session.notes ?? "").trim() && (
                <div className="hidden md:block text-[11px] text-[#5A8399] mt-1 truncate" title={session.notes}>
                  {session.notes}
                </div>
              )}
            </div>
            </div>
            <MenuTrigger
              label={`Options for ${classTitle || formatTimeRange(session.time, session.end_time)}`}
              className="-my-[13px]"
              onOpen={(el) => {
                setSlotMenuIndex(index);
                setSlotMenuButtonEl(el);
              }}
            />
          </div>

          {editingSessionIndex === index && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="col-span-2 md:col-span-3">
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  Class name <span className="normal-case font-normal text-[#5A8399]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={session.label ?? ""}
                  onChange={(e) => updateSession(index, "label", e.target.value)}
                  placeholder="e.g. Men's Class 1"
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                />
              </div>
              <div className="col-span-2 md:col-span-2">
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  Section <span className="normal-case font-normal text-[#5A8399]">(optional)</span>
                </label>
                <input
                  type="text"
                  list="edit-session-sections"
                  value={session.section ?? ""}
                  onChange={(e) => updateSession(index, "section", e.target.value)}
                  placeholder="e.g. Men's Side"
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  Start
                </label>
                <TimeInput
                  value={session.time}
                  onChange={(v) => updateSession(index, "time", v)}
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  End
                </label>
                <TimeInput
                  value={session.end_time ?? ""}
                  onChange={(v) => updateSession(index, "end_time", v)}
                  placeholder="e.g. 5pm"
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  Spots
                </label>
                <input
                  type="number"
                  min={1}
                  value={
                    capacityInputDraft[index] !== undefined
                      ? capacityInputDraft[index]
                      : String(session.capacity)
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "" || /^\d+$/.test(raw)) {
                      setCapacityInputDraft((prev) => ({ ...prev, [index]: raw }));
                      if (raw !== "") {
                        const n = parseInt(raw, 10);
                        if (n >= 1) {
                          updateSession(index, "capacity", n);
                        }
                      }
                    }
                  }}
                  onBlur={() => commitCapacityDraft(index)}
                  onFocus={selectAllSpotsOnFocus}
                  onMouseUp={keepSpotsSelectionOnMouseUp}
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={session.location}
                  onChange={(e) => updateSession(index, "location", e.target.value)}
                  placeholder="e.g., Meetinghouse"
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70"
                />
              </div>
              <div className="col-span-2 md:col-span-5">
                <label className="block text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                  Notes
                </label>
                <textarea
                  value={session.notes}
                  onChange={(e) => updateSession(index, "notes", e.target.value)}
                  placeholder="Optional"
                  rows={2}
                  className="w-full text-sm text-[#0D2B35] px-3 py-[10px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl bg-white outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399] placeholder:opacity-70 resize-none"
                />
              </div>
              <div className="col-span-2 md:col-span-5 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    commitCapacityDraft(index);
                    setEditingSessionIndex(null);
                  }}
                  className="min-h-[44px] px-6 text-sm font-semibold text-white bg-[#0E96B0] hover:bg-[#08647E] rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
                </div>{/* session card */}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addClassToDate(group)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors px-0.5 pt-1"
          >
            <span className="w-4 h-4 rounded bg-[#E6F7FB] flex items-center justify-center text-[#0E96B0] leading-none">+</span>
            Add a slot to this date
          </button>
          </>
          )}
        </div>
        );
      })}
    </div>
  )
  );
}
