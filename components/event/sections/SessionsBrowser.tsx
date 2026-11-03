"use client";

import { DAYS, orderSessionsBySection } from "@/components/event/event-page-shared";
import { Fragment } from "react";
import { formatTime } from "@/lib/utils";
import { type EventPageView } from "@/components/event/hooks/deriveEventPageView";

/** Calendar and day-list views of sessions to pick from. */
export default function SessionsBrowser({ ctx }: { ctx: EventPageView }) {
  const {
    calendarMonth,
    eventType,
    groupedSessions,
    handleCalendarDateClick,
    isSingleSession,
    selectAllDaySessions,
    selectedCalendarDate,
    selectedSessions,
    sessionHeadcount,
    sessions,
    setCalendarMonth,
    showCapacityPublicly,
    showSignupsPublicly,
    toggleSessionSelection,
    viewMode,
  } = ctx;

  return (
    !isSingleSession && (eventType === "spots" || eventType === "rsvp") && Object.keys(groupedSessions).length > 0 && (
    <div className="space-y-4 mb-32">
      {/* Mini Calendar — shown in calendar view */}
      {viewMode === "calendar" && (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
          {/* Calendar header */}
          <div className="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between">
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#E6F7FB] text-[#5A8399] hover:text-[#0E96B0] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="font-serif text-base text-[#0D2B35]">
              {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#E6F7FB] text-[#5A8399] hover:text-[#0E96B0] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          <div className="p-4">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {["S","M","T","W","T","F","S"].map((label, i) => (
                <div key={i} className="text-center text-[11px] font-semibold text-[#5A8399] tracking-[0.5px] py-1">
                  {label}
                </div>
              ))}
            </div>

            {/* Day cells */}
            {(() => {
              const year = calendarMonth.getFullYear();
              const month = calendarMonth.getMonth();
              const firstDayOfWeek = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const today = new Date();
              const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
              const todayDate = today.getDate();

              // Compute which days have sessions and which have available spots
              const sessionDays = new Set<number>();
              const availableDays = new Set<number>();
              // In the current month, past days shouldn't be markable.
              const isPastDay = (d: number) => isCurrentMonth && d < todayDate;
              for (const session of sessions) {
                const hasSpot = sessionHeadcount(session) < session.capacity;
                if (session.session_date) {
                  const [sy, sm, sd] = session.session_date.split("-").map(Number);
                  if (sy === year && sm - 1 === month && !isPastDay(sd)) {
                    sessionDays.add(sd);
                    if (hasSpot) availableDays.add(sd);
                  }
                } else {
                  for (let d = 1; d <= daysInMonth; d++) {
                    if (isPastDay(d)) continue;
                    if (new Date(year, month, d).getDay() === session.day_of_week) {
                      sessionDays.add(d);
                      if (hasSpot) availableDays.add(d);
                    }
                  }
                }
              }

              const cells = [];
              for (let i = 0; i < firstDayOfWeek; i++) {
                cells.push(<div key={`e${i}`} />);
              }
              for (let d = 1; d <= daysInMonth; d++) {
                const hasSession = sessionDays.has(d);
                const hasAvailable = availableDays.has(d);
                const isToday = isCurrentMonth && d === todayDate;
                const isSelected = selectedCalendarDate?.day === d && selectedCalendarDate?.year === year && selectedCalendarDate?.month === month;
                cells.push(
                  <div
                    key={d}
                    onClick={() => hasSession && handleCalendarDateClick(d, year, month)}
                    className={`flex flex-col items-center rounded-lg transition-colors ${
                      hasSession ? "cursor-pointer" : ""
                    } ${isSelected ? "bg-[#E6F7FB]" : hasSession ? "hover:bg-[#F4FAFB]" : ""}`}
                  >
                    <div className={`mt-2 w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium transition-all ${
                      isSelected
                        ? "bg-[#0E96B0] text-white ring-2 ring-[#0E96B0]/30 ring-offset-1"
                        : isToday
                        ? "bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white"
                        : hasSession
                        ? "text-[#0D2B35] font-semibold"
                        : "text-[#B0C8D4]"
                    }`}>
                      {d}
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full mt-0.5 mb-1 transition-colors ${
                      hasAvailable ? (isSelected ? "bg-[#0E96B0]" : "bg-[#22C8D8]") : "bg-transparent"
                    }`} />
                  </div>
                );
              }
              return <div className="grid grid-cols-7 gap-y-0.5">{cells}</div>;
            })()}
          </div>
        </div>
      )}


      {/* No sessions for this date */}
      {selectedCalendarDate && Object.keys(groupedSessions).length === 0 && (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
          <p className="text-sm text-[#5A8399]">No slots on this date.</p>
        </div>
      )}

      {Object.entries(groupedSessions).map(([dateKey, daySessions]) => {
        const headerLabel = dateKey.startsWith("dow-")
          ? DAYS[parseInt(dateKey.slice(4))]
          : (() => {
              const [y, m, d] = dateKey.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
            })();

        const availableSessions = daySessions.filter((s) => sessionHeadcount(s) < s.capacity);
        const allDaySelected = availableSessions.length > 0 && availableSessions.every((s) => selectedSessions.includes(s.id));

        return (
          <div key={dateKey} id={`day-${dateKey}`} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#0E96B0]/8 bg-gradient-to-r from-[#F4FAFB] to-white flex items-center justify-between">
              <h2 className="font-serif text-xl text-[#0D2B35]">{headerLabel}</h2>
              {availableSessions.length > 0 && (
                <button onClick={() => selectAllDaySessions(daySessions)}
                  className="text-xs font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors">
                  {allDaySelected ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>

            <div className="p-4 space-y-2">
              {orderSessionsBySection(daySessions).map((session, sIdx, sArr) => {
                const filled = sessionHeadcount(session);
                const isFull = filled >= session.capacity;
                const isSelected = selectedSessions.includes(session.id);
                const sectionKey = (session.section ?? "").trim();
                const prevKey = sIdx > 0 ? (sArr[sIdx - 1].section ?? "").trim() : "";
                const showHeader = sectionKey !== "" && sectionKey !== prevKey;

                return (
                  <Fragment key={session.id}>
                    {showHeader && (
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#5A8399] px-1 pt-3 first:pt-1">
                        {sectionKey}
                      </h3>
                    )}
                    <button
                      onClick={() => !isFull && toggleSessionSelection(session.id)}
                      disabled={isFull}
                      className={`w-full text-left border-[1.5px] rounded-xl p-4 transition-all ${
                        isSelected
                          ? "border-[#0E96B0] bg-[#E6F7FB]"
                          : isFull
                          ? "border-[#0E96B0]/10 bg-[#F4FAFB] cursor-not-allowed opacity-60"
                          : "border-[#0E96B0]/15 hover:border-[#0E96B0]/45 hover:bg-[#F4FAFB]"
                      }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-[18px] h-[18px] border-2 rounded-[5px] flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            isSelected ? "bg-[#0E96B0] border-[#0E96B0]" : isFull ? "bg-[#E6F7FB] border-[#0E96B0]/20" : "border-[#0E96B0]/30"
                          }`}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" stroke="currentColor">
                                <path d="M5 13l4 4L19 7"/>
                              </svg>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-[#0D2B35]">
                              {session.label || (
                                <>
                                  {formatTime(session.time)}
                                  {session.end_time && ` – ${formatTime(session.end_time)}`}
                                </>
                              )}
                              {session.location && <span className="text-[#5A8399] font-normal"> · {session.location}</span>}
                            </div>
                            {session.label && (
                              <div className="text-xs text-[#5A8399] mt-0.5">
                                {formatTime(session.time)}
                                {session.end_time && ` – ${formatTime(session.end_time)}`}
                              </div>
                            )}
                            {session.notes && <div className="text-xs text-[#5A8399] mt-0.5">{session.notes}</div>}
                          </div>
                        </div>
                        {(isFull || (showCapacityPublicly && session.capacity < 999)) && (
                          <div className="text-right flex-shrink-0 ml-4">
                            <div className={`text-xs font-semibold ${isFull ? "text-red-500" : "text-[#1D9E75]"}`}>
                              {isFull ? "Full" : `${session.capacity - filled} left`}
                            </div>
                            {showCapacityPublicly && session.capacity < 999 && (
                              <div className="text-[11px] text-[#5A8399]">{filled}/{session.capacity} filled</div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                    {showSignupsPublicly && (session.signups?.length ?? 0) > 0 && (
                      <div className="mt-1.5 ml-7 mr-1 px-3 py-2 rounded-lg bg-[#F4FAFB] border border-[#0E96B0]/10">
                        <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-1">
                          Signed up
                        </div>
                        <div className="space-y-0.5">
                          {session.signups!.map((sig) => (
                            <div key={sig.id} className="text-xs text-[#2E5566]">
                              <span className="font-medium">{sig.member_name}</span>
                              {sig.guest_names?.length > 0 && (
                                <span className="text-[#5A8399]"> +{sig.guest_names.length}</span>
                              )}
                              {sig.signup_note && (
                                <span className="text-[#5A8399]"> — {sig.signup_note}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  )
  );
}
