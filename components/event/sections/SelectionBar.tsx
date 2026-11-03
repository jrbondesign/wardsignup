"use client";

import { type EventPageView } from "@/components/event/hooks/deriveEventPageView";

/** Bottom bar showing selected sessions. */
export default function SelectionBar({ ctx }: { ctx: EventPageView }) {
  const {
    isSingleSession,
    selectedSessions,
    setSelectedSessions,
    setShowSignupForm,
    showSignupForm,
  } = ctx;

  return (
    !isSingleSession && selectedSessions.length > 0 && !showSignupForm && (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="bg-white border-t border-[#0E96B0]/12 shadow-[0_-8px_32px_rgba(8,100,126,0.12)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[#0D2B35]">
              {selectedSessions.length} {selectedSessions.length === 1 ? "session" : "sessions"} selected
            </div>
            <div className="text-xs text-[#5A8399]">Continue to enter your information</div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setSelectedSessions([])}
              className="text-sm font-medium px-4 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all">
              Clear
            </button>
            <button onClick={() => setShowSignupForm(true)}
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 hover:shadow-[0_5px_16px_rgba(14,150,176,0.40)] transition-all">
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
  );
}
