"use client";

import { type EditEventCtx } from "@/components/edit/hooks/useEditEvent";

/** Schedule heading with the Add sessions menu. */
export default function SessionsHeader({ ctx }: { ctx: EditEventCtx }) {
  const {
    addSessionsMenuRef,
    setShowAddSession,
    setShowAddSessionsMenu,
    setShowBulk,
    setShowReschedule,
    showAddSessionsMenu,
    showReschedule,
  } = ctx;

  return (
    <div id="sessions-section" className="border-t border-[rgba(14,150,176,0.12)] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#0D2B35]">Slots</div>
          <div className="text-xs text-[#5A8399]">Add, edit, or replace slots for this event</div>
        </div>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-shrink-0">
          <div className="relative w-full sm:w-auto" ref={addSessionsMenuRef}>
            <button
              type="button"
              onClick={() => setShowAddSessionsMenu((v) => !v)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(14,150,176,0.40)] transition-all"
            >
              Add slots
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${showAddSessionsMenu ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {showAddSessionsMenu && (
              <div className="absolute left-0 right-0 sm:left-auto sm:right-0 mt-2 w-full sm:w-64 bg-white rounded-xl shadow-[0_10px_32px_rgba(8,100,126,0.18)] border border-[#0E96B0]/10 py-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSessionsMenu(false);
                    setShowBulk(false);
                    setShowAddSession(true);
                    setTimeout(() => {
                      const el = document.getElementById("add-one-session");
                      if (el) {
                        const top = el.getBoundingClientRect().top + window.scrollY - 16;
                        window.scrollTo({ top, behavior: "smooth" });
                      }
                    }, 50);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                >
                  Add one session
                  <div className="text-[11px] text-[#5A8399] mt-0.5">Pick a single date or day-of-week</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSessionsMenu(false);
                    setShowAddSession(false);
                    setShowBulk(true);
                    setTimeout(() => {
                      const el = document.getElementById("add-multiple-sessions");
                      if (el) {
                        const top = el.getBoundingClientRect().top + window.scrollY - 16;
                        window.scrollTo({ top, behavior: "smooth" });
                      }
                    }, 50);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#2E5566] hover:bg-[#E6F7FB] hover:text-[#0D2B35] transition-colors"
                >
                  Add multiple sessions
                  <div className="text-[11px] text-[#5A8399] mt-0.5">Same time &amp; details across several days</div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !showReschedule;
              setShowReschedule(next);
              if (next) {
                setShowBulk(false);
                setShowAddSession(false);
                setTimeout(() => {
                  const el = document.getElementById("replace-schedule");
                  if (el) {
                    const top = el.getBoundingClientRect().top + window.scrollY - 16;
                    window.scrollTo({ top, behavior: "smooth" });
                  }
                }, 50);
              }
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-amber-300/70 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            Replace all sessions
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 transition-transform ${showReschedule ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
