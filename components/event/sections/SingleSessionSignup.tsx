"use client";

import { DAYS } from "@/components/event/event-page-shared";
import { formatTime } from "@/lib/utils";
import EmailTypoHint from "@/components/EmailTypoHint";
import { signerEmailHint } from "@/lib/reminder-copy";
import EmailNudgePrompt from "@/components/EmailNudgePrompt";
import SignerEmailHint from "@/components/event/SignerEmailHint";
import { type EventPageView } from "@/components/event/hooks/deriveEventPageView";

/** Inline signup form for single-session events. */
export default function SingleSessionSignup({ ctx }: { ctx: EventPageView }) {
  const {
    allowGuests,
    error,
    eventType,
    formData,
    guestNameFields,
    emailInputRef,
    handleNudgeAdd,
    handleNudgeSkip,
    handleSignup,
    nudgeOpen,
    isSingleSession,
    sessionHeadcount,
    sessions,
    setFormData,
    showCapacityPublicly,
    showSignupsPublicly,
    signupSessionIds,
    singleSession,
    singleSessionFull,
    submitting,
    success,
    trackEmailEntered,
    trackFormStarted,
  } = ctx;

  return (
    isSingleSession && (eventType === "spots" || eventType === "rsvp") && !success && (
    <div className="mb-6">
      {singleSessionFull ? (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-[#F4FAFB] border border-[#0E96B0]/20 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#5A8399]">
              <circle cx="12" cy="12" r="10"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/>
            </svg>
          </div>
          <h2 className="font-serif text-xl text-[#0D2B35] mb-2">This event is full</h2>
          <p className="text-sm text-[#5A8399]">All spots have been filled. Check back later in case a spot opens up.</p>
          {showSignupsPublicly && singleSession && (singleSession.signups?.length ?? 0) > 0 && (
            <div className="mt-6 pt-6 border-t border-[#0E96B0]/8 text-left">
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-2">
                Signed up
              </div>
              <div className="space-y-1">
                {singleSession.signups!.map((sig) => (
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
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-7">
          {/* Session info as static context */}
          {singleSession && (
            <div className="flex items-center gap-2 text-sm text-[#5A8399] mb-5 pb-5 border-b border-[#0E96B0]/8">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#0E96B0] flex-shrink-0">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>
                {singleSession.session_date
                  ? (() => { const [y,m,d] = singleSession.session_date!.split("-").map(Number); return new Date(y, m-1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); })()
                  : DAYS[singleSession.day_of_week]}
                {" · "}{formatTime(singleSession.time)}
                {singleSession.end_time && ` – ${formatTime(singleSession.end_time)}`}
                {singleSession.location && ` · ${singleSession.location}`}
              </span>
              {showCapacityPublicly && singleSession.capacity < 999 && (
                <span className="ml-auto text-[#1D9E75] font-semibold flex-shrink-0">
                  {singleSession.capacity - sessionHeadcount(singleSession)} {singleSession.capacity - sessionHeadcount(singleSession) === 1 ? "spot" : "spots"} left
                </span>
              )}
            </div>
          )}

          {showSignupsPublicly && singleSession && (singleSession.signups?.length ?? 0) > 0 && (
            <div className="mb-5 pb-5 border-b border-[#0E96B0]/8">
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.3px] mb-2">
                Signed up
              </div>
              <div className="space-y-1">
                {singleSession.signups!.map((sig) => (
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

          <h2 className="font-serif text-2xl text-[#0D2B35] mb-5">Register for this event</h2>

          <form onSubmit={handleSignup} onFocusCapture={() => trackFormStarted("slots")} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                Your Name <span className="text-red-400">*</span>
              </label>
              <input type="text" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="First and last name"
                className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                required disabled={submitting} />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                Email <span className="text-[#5A8399] font-normal">(optional)</span>
              </label>
              <input type="email" value={formData.email} ref={emailInputRef}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                onBlur={(e) => trackEmailEntered("slots", e.target.value)}
                placeholder="you@example.com"
                className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                disabled={submitting} />
              <EmailTypoHint email={formData.email} onAccept={(fixed) => setFormData({ ...formData, email: fixed })} />
              <SignerEmailHint text={signerEmailHint(sessions, signupSessionIds)} />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                Phone <span className="text-[#5A8399] font-normal">(optional)</span>
              </label>
              <input type="tel" value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 123-4567"
                className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
                disabled={submitting} />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
                Note <span className="text-[#5A8399] font-normal">(optional)</span>
              </label>
              <textarea value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="Anything you'd like to share with the organizer"
                rows={2}
                className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70 resize-none"
                disabled={submitting} />
            </div>
            {allowGuests && guestNameFields}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}
            {nudgeOpen && <EmailNudgePrompt onAdd={handleNudgeAdd} onSkip={handleNudgeSkip} disabled={submitting} />}
            <button type="submit" disabled={submitting}
              className="w-full text-base font-semibold px-4 py-[15px] rounded-xl text-white bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] shadow-[0_6px_20px_rgba(14,150,176,0.38)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(14,150,176,0.45)] active:translate-y-0 transition-all disabled:opacity-60 disabled:cursor-default disabled:translate-y-0">
              {submitting ? "Signing up…" : "Sign Up"}
            </button>
          </form>
        </div>
      )}
    </div>
  )
  );
}
