"use client";

import { DAYS } from "@/components/event/event-page-shared";
import { formatTime } from "@/lib/utils";
import EmailTypoHint from "@/components/EmailTypoHint";
import { signerEmailHint } from "@/lib/reminder-copy";
import SignerEmailHint from "@/components/event/SignerEmailHint";
import { type EventPageView } from "@/components/event/hooks/deriveEventPageView";

/** Signup form modal for the selected sessions. */
export default function SignupFormModal({ ctx }: { ctx: EventPageView }) {
  const {
    allowGuests,
    error,
    formData,
    guestNameFields,
    handleSignup,
    selectedSessions,
    sessions,
    setError,
    setFormData,
    setShowSignupForm,
    showSignupForm,
    signupSessionIds,
    submitting,
  } = ctx;

  return (
    showSignupForm && (
    <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.20)] max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-2xl text-[#0D2B35] mb-1">Complete your sign up</h2>
        <p className="text-sm text-[#5A8399] mb-5">
          Signing up for {selectedSessions.length} {selectedSessions.length === 1 ? "session" : "sessions"}
        </p>

        {/* Selected sessions summary */}
        <div className="mb-5 bg-[#E6F7FB] border border-[#0E96B0]/15 rounded-xl p-4 max-h-36 overflow-y-auto">
          <div className="text-[11px] font-semibold text-[#0E96B0] uppercase tracking-[0.6px] mb-2">Selected slots</div>
          <div className="space-y-1">
            {selectedSessions.map((sessionId) => {
              const session = sessions.find((s) => s.id === sessionId);
              if (!session) return null;
              return (
                <div key={sessionId} className="text-xs text-[#2E5566] flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[#0E96B0] flex-shrink-0" />
                  {session.session_date
                    ? (() => {
                        const [y, m, d] = session.session_date.split('-').map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      })()
                    : DAYS[session.day_of_week]}
                  {" · "}{formatTime(session.time)}{session.end_time ? ` – ${formatTime(session.end_time)}` : ""}
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
              Your Name <span className="text-red-400">*</span>
            </label>
            <input type="text" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70"
              required />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
              Email <span className="text-[#5A8399] font-normal">(optional)</span>
            </label>
            <input type="email" value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70" />
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
              className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70" />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#2E5566] tracking-[0.2px] mb-1.5">
              Note <span className="text-[#5A8399] font-normal">(optional)</span>
            </label>
            <textarea value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Anything you'd like to share with the organizer"
              rows={2}
              className="w-full text-sm text-[#0D2B35] px-[16px] py-[12px] border-[1.5px] border-[rgba(14,150,176,0.22)] rounded-xl outline-none transition-all focus:border-[#0E96B0] focus:shadow-[0_0_0_3px_rgba(14,150,176,0.12)] placeholder:text-[#5A8399]/70 resize-none" />
          </div>
          {allowGuests && guestNameFields}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button"
              onClick={() => { setShowSignupForm(false); setError(""); }}
              className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all">
              Back
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] disabled:opacity-60 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] transition-all">
              {submitting ? "Signing up…" : `Sign Up for ${selectedSessions.length} ${selectedSessions.length === 1 ? "Session" : "Sessions"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
  );
}
